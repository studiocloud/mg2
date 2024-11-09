import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { createReadStream, unlinkSync } from 'fs';
import { validateEmail } from '../validators/emailValidator.js';

const router = express.Router();

const upload = multer({ 
  dest: 'uploads/',
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      cb(new Error('Only CSV files are allowed'));
      return;
    }
    cb(null, true);
  }
});

// Single email validation endpoint
router.post('/validate', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        valid: false,
        reason: 'Email is required'
      });
    }

    const result = await validateEmail(email);
    return res.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({
      valid: false,
      reason: process.env.NODE_ENV === 'production' 
        ? 'Server error occurred' 
        : error.message
    });
  }
});

// Optimized bulk validation endpoint
router.post('/validate/bulk', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ 
      type: 'error',
      error: 'CSV file is required' 
    });
  }

  // Set headers for better network stability
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Extended timeouts
  req.setTimeout(3600000); // 1 hour
  res.setTimeout(3600000); // 1 hour

  let cleanup = true;
  const BATCH_SIZE = 25;
  const PARALLEL_BATCHES = 4;
  const MAX_RETRIES = 2;
  const RETRY_DELAY = 500;
  let processedCount = 0;
  let totalRecords = 0;
  const results = [];
  let originalHeaders = [];

  // Helper function to send progress updates
  const sendProgress = (progress) => {
    try {
      if (!res.writableEnded) {
        res.write(JSON.stringify({
          type: 'progress',
          progress: Math.min(progress, 100),
          processing: true,
          originalHeaders
        }) + '\n');
      }
    } catch (error) {
      console.error('Error sending progress:', error);
    }
  };

  // Setup keepalive interval
  const keepaliveInterval = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  try {
    // First pass: count total records and get headers
    const countParser = parse({
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    const records = [];
    await new Promise((resolve, reject) => {
      createReadStream(req.file.path)
        .pipe(countParser)
        .on('data', (record) => {
          if (totalRecords === 0) {
            originalHeaders = Object.keys(record);
          }
          records.push(record);
          totalRecords++;
        })
        .on('error', reject)
        .on('end', resolve);
    });

    if (totalRecords === 0) {
      throw new Error('CSV file is empty');
    }

    // Process batch with optimized retries
    const processBatch = async (batch) => {
      const validations = batch.map(async (record) => {
        const email = record.email || record.Email || record.EMAIL;
        
        if (!email) {
          return {
            ...record,
            validation_result: 'Invalid',
            validation_reason: 'No email address found',
            mx_check: false,
            dns_check: false,
            spf_check: false,
            mailbox_check: false,
            smtp_check: false
          };
        }

        try {
          const validationResult = await validateEmail(email);
          return {
            ...record,
            validation_result: validationResult.valid ? 'Valid' : 'Invalid',
            validation_reason: validationResult.reason || 'Unknown validation status',
            mx_check: validationResult.checks?.mx || false,
            dns_check: validationResult.checks?.dns || false,
            spf_check: validationResult.checks?.spf || false,
            mailbox_check: validationResult.checks?.mailbox || false,
            smtp_check: validationResult.checks?.smtp || false
          };
        } catch (error) {
          return {
            ...record,
            validation_result: 'Invalid',
            validation_reason: error.message || 'Validation failed',
            mx_check: false,
            dns_check: false,
            spf_check: false,
            mailbox_check: false,
            smtp_check: false
          };
        }
      });

      return Promise.all(validations);
    };

    // Process records in parallel batches
    for (let i = 0; i < records.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
      const batchPromises = [];
      
      for (let j = 0; j < PARALLEL_BATCHES; j++) {
        const start = i + (j * BATCH_SIZE);
        const batch = records.slice(start, start + BATCH_SIZE);
        
        if (batch.length > 0) {
          batchPromises.push(processBatch(batch));
        }
      }

      const batchResults = await Promise.all(batchPromises);
      const flatResults = batchResults.flat();
      results.push(...flatResults);
      
      processedCount += flatResults.length;
      sendProgress((processedCount / totalRecords) * 100);

      // Small delay between parallel batch groups
      if (i + BATCH_SIZE * PARALLEL_BATCHES < records.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    clearInterval(keepaliveInterval);

    if (!res.writableEnded) {
      res.write(JSON.stringify({
        type: 'complete',
        processing: false,
        totalProcessed: processedCount,
        results,
        originalHeaders
      }) + '\n');
    }

    res.end();
  } catch (error) {
    console.error('Bulk validation error:', error);
    clearInterval(keepaliveInterval);
    
    if (!res.writableEnded) {
      if (!res.headersSent) {
        res.status(500);
      }
      res.write(JSON.stringify({
        type: 'error',
        error: process.env.NODE_ENV === 'production'
          ? 'Failed to process CSV file'
          : error.message
      }) + '\n');
      res.end();
    }
  } finally {
    clearInterval(keepaliveInterval);
    if (cleanup && req.file?.path) {
      try {
        unlinkSync(req.file.path);
      } catch (error) {
        console.error('Failed to cleanup uploaded file:', error);
      }
    }
  }
});

export default router;