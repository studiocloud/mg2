import React, { useState, useCallback } from 'react';
import { EmailInput } from './EmailInput';
import { BulkUpload } from './BulkUpload';
import { ResultsDisplay } from './ResultsDisplay';
import { ValidationResult } from '../types';
import { AlertCircle, Download, Loader2 } from 'lucide-react';
import { supabase, uploadCSV, uploadValidatedCSV, downloadValidatedCSV } from '../lib/supabase';

export function ValidationForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ValidationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<ValidationResult[]>([]);
  const [showDownloadButton, setShowDownloadButton] = useState(false);
  const [originalHeaders, setOriginalHeaders] = useState<string[]>([]);
  const [validatedFilePath, setValidatedFilePath] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('');

  const validateSingleEmail = async () => {
    if (!email) return;
    
    setLoading(true);
    setError(null);
    setResults([]);
    setBulkResults([]);
    setShowDownloadButton(false);
    
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      const transformedResult: ValidationResult = {
        email,
        validation_result: result.valid ? 'Valid' : 'Invalid',
        validation_reason: result.reason || 'Unknown validation status',
        mx_check: result.checks?.mx || false,
        dns_check: result.checks?.dns || false,
        spf_check: result.checks?.spf || false,
        mailbox_check: result.checks?.mailbox || false,
        smtp_check: result.checks?.smtp || false
      };
      
      setResults([transformedResult]);
    } catch (error) {
      console.error('Validation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to validate email');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;

    setLoading(true);
    setProgress(0);
    setError(null);
    setResults([]);
    setBulkResults([]);
    setShowDownloadButton(false);
    setOriginalHeaders([]);
    setValidatedFilePath(null);
    setOriginalFileName(file.name);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Please sign in to upload files');
      }

      // Upload original CSV to Supabase
      setProgress(10);
      const uploadResult = await uploadCSV(file, user.id);
      if (!uploadResult?.path) {
        throw new Error('Failed to upload CSV');
      }
      
      setProgress(30);

      // Send for validation
      const formData = new FormData();
      formData.append('file', file);
      formData.append('csvPath', uploadResult.path);

      const response = await fetch('/api/validate/bulk', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to read response stream');
      }

      const textDecoder = new TextDecoder();
      let accumulatedResults: ValidationResult[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = textDecoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.type === 'progress') {
              setProgress(30 + (data.progress * 0.6)); // Scale progress from 30% to 90%
              if (data.originalHeaders) {
                setOriginalHeaders(data.originalHeaders);
              }
            } else if (data.type === 'complete') {
              if (data.originalHeaders) {
                setOriginalHeaders(data.originalHeaders);
              }
              accumulatedResults = data.results;
              setBulkResults(data.results);
              
              // Create and upload validated CSV
              const validationHeaders = [
                'validation_result',
                'validation_reason',
                'mx_check',
                'dns_check',
                'spf_check',
                'mailbox_check',
                'smtp_check'
              ];
              const allHeaders = [...data.originalHeaders, ...validationHeaders];
              
              const csvContent = [
                allHeaders.join(','),
                ...data.results.map(result => 
                  allHeaders.map(header => {
                    const value = result[header];
                    if (value === undefined || value === null) return '';
                    if (typeof value === 'string' && value.includes(',')) {
                      return `"${value.replace(/"/g, '""')}"`;
                    }
                    return value;
                  }).join(',')
                )
              ].join('\n');

              const blob = new Blob([csvContent], { type: 'text/csv' });
              const validatedResult = await uploadValidatedCSV(blob, user.id, file.name);
              setValidatedFilePath(validatedResult?.path || null);
              setProgress(100);
              setShowDownloadButton(true);
            } else if (data.type === 'error') {
              throw new Error(data.error);
            }
          } catch (e) {
            console.error('Error parsing chunk:', e);
          }
        }
      }
    } catch (error) {
      console.error('Bulk validation error:', error);
      setError(error instanceof Error ? error.message : 'Failed to process CSV file');
      setBulkResults([]);
      setShowDownloadButton(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownload = useCallback(async () => {
    if (!validatedFilePath) return;

    try {
      setLoading(true);
      const blob = await downloadValidatedCSV(validatedFilePath);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `validated_${originalFileName}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to download results');
    } finally {
      setLoading(false);
    }
  }, [validatedFilePath, originalFileName]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
      <EmailInput
        email={email}
        setEmail={setEmail}
        onValidate={validateSingleEmail}
        loading={loading}
      />
      
      <BulkUpload
        onFileSelect={handleFileSelect}
        loading={loading}
        progress={progress}
      />
      
      {error && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <ResultsDisplay
          results={results}
          onDownload={handleDownload}
          showDownload={false}
        />
      )}

      {bulkResults.length > 0 && showDownloadButton && (
        <div className="flex justify-center mt-8">
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full max-w-md px-6 py-3 bg-green-600 text-white text-lg font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                <span>Download Results</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}