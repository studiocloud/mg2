# Email Validator Pro

A professional email validation system with real-time MX, DNS, SPF, and mailbox verification capabilities.

## Features

- ✨ Single email validation
- 📦 Bulk validation via CSV upload
- 🔍 Deep validation checks:
  - DNS record verification
  - MX record validation
  - SPF record checking
  - SMTP server verification
  - Mailbox existence validation
- 🚀 Real-time progress tracking
- 📊 Detailed validation reports
- 💾 CSV export functionality
- 🔒 User authentication via Supabase
- 🎯 Rate limiting protection
- 🌐 Production-ready deployment support

## Tech Stack

- **Frontend:**
  - React 18
  - TypeScript
  - Tailwind CSS
  - Lucide Icons
  - React Router DOM

- **Backend:**
  - Node.js
  - Express
  - Multer (file uploads)
  - CSV Parser
  - Custom SMTP verification

- **Authentication:**
  - Supabase Auth

## API Endpoints

### Single Email Validation
```http
POST /api/validate
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Bulk Validation
```http
POST /api/validate/bulk
Content-Type: multipart/form-data

file: emails.csv
```

## Validation Checks

1. **Format Check**
   - RFC 5322 compliance
   - Length restrictions
   - Character validation

2. **DNS Check**
   - Domain existence
   - A/AAAA record verification
   - CNAME resolution

3. **MX Check**
   - MX record existence
   - Priority handling
   - Server availability

4. **SPF Check**
   - SPF record validation
   - Policy verification
   - Record syntax check

5. **SMTP Check**
   - Server connection
   - HELO/EHLO handshake
   - TLS support detection

6. **Mailbox Check**
   - RCPT TO verification
   - Catch-all detection
   - Disposable email detection

## Response Format

### Single Email
```typescript
interface ValidationResponse {
  email: string;
  valid: boolean;
  reason: string;
  checks: {
    format: boolean;
    dns: boolean;
    mx: boolean;
    spf: boolean;
    smtp: boolean;
    mailbox: boolean;
  };
  details: {
    mxRecords: MXRecord[];
    spfRecord: string | null;
    smtpResponse: SMTPResponse | null;
  };
}
```

### Bulk Validation
```typescript
interface BulkValidationResult {
  email: string;
  validation_result: 'Valid' | 'Invalid';
  validation_reason: string;
  mx_check: boolean;
  dns_check: boolean;
  spf_check: boolean;
  mailbox_check: boolean;
  smtp_check: boolean;
}
```

## Configuration

### Environment Variables
```env
NODE_ENV=development
PORT=8080
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Rate Limiting
- 100 requests per 15 minutes per IP
- 10MB file size limit for CSV uploads

## Development

1. Install dependencies:
```bash
npm install
cd server && npm install
```

2. Start development servers:
```bash
# Frontend
npm run dev

# Backend
cd server && node index.js
```

## Production Deployment

1. Build the frontend:
```bash
npm run build
```

2. Start the production server:
```bash
npm start
```

## Security Features

- CORS protection
- Rate limiting
- File size restrictions
- Secure file cleanup
- Error sanitization
- TLS support detection
- Authentication required

## Best Practices

### Frontend
- Modular component architecture
- TypeScript for type safety
- Progressive enhancement
- Error boundary implementation
- Loading state management
- Responsive design

### Backend
- Streaming response handling
- Chunked file processing
- Memory efficient CSV parsing
- Proper error handling
- File cleanup
- Security headers

## Error Handling

- Detailed error messages in development
- Sanitized errors in production
- Proper status codes
- Client-side validation
- Server-side validation
- File type verification

## Performance Optimizations

- Chunked CSV processing
- Streaming responses
- Parallel validation
- Progress tracking
- Efficient memory usage
- Proper cleanup

## License

MIT License - See [LICENSE](LICENSE) for details