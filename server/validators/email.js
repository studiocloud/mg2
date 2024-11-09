import dns from 'dns';
import { promisify } from 'util';
import { getProviderConfig, performSMTPCheck } from './providers.js';

const resolveMx = promisify(dns.resolveMx);
const resolveTxt = promisify(dns.resolveTxt);

const validateEmailFormat = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]{0,61}[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z]{2,})+$/;
  return emailRegex.test(email);
};

const checkDNS = async (domain) => {
  try {
    const checks = [
      dns.promises.resolve(domain, 'A'),
      dns.promises.resolve(domain, 'AAAA'),
      dns.promises.resolve(domain, 'CNAME')
    ];
    const results = await Promise.allSettled(checks);
    return results.some(result => result.status === 'fulfilled');
  } catch {
    return false;
  }
};

const checkMX = async (domain) => {
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) return false;
    return records.sort((a, b) => a.priority - b.priority);
  } catch {
    return false;
  }
};

const checkSPF = async (domain) => {
  try {
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.flat().find(record => record.startsWith('v=spf1'));
    return {
      exists: !!spfRecord,
      record: spfRecord
    };
  } catch {
    return {
      exists: false,
      record: null
    };
  }
};

export const validateEmail = async (email) => {
  const result = {
    email,
    valid: false,
    checks: {
      format: false,
      dns: false,
      mx: false,
      spf: false,
      smtp: false,
      mailbox: false
    },
    details: {
      mxRecords: [],
      spfRecord: null,
      smtpResponse: null
    },
    reason: ''
  };

  // Step 1: Format Check
  result.checks.format = validateEmailFormat(email);
  if (!result.checks.format) {
    result.reason = 'Invalid email format';
    return result;
  }

  const [localPart, domain] = email.split('@');
  
  if (localPart.length > 64) {
    result.reason = 'Local part exceeds maximum length';
    return result;
  }
  
  if (domain.length > 255) {
    result.reason = 'Domain exceeds maximum length';
    return result;
  }

  // Step 2: DNS Check
  result.checks.dns = await checkDNS(domain);
  if (!result.checks.dns) {
    result.reason = 'Domain does not exist';
    return result;
  }

  // Step 3: MX Records Check
  const mxRecords = await checkMX(domain);
  if (!mxRecords) {
    result.reason = 'No mail servers found for domain';
    return result;
  }
  
  result.checks.mx = true;
  result.details.mxRecords = mxRecords;

  // Step 4: SPF Check
  const spfResult = await checkSPF(domain);
  result.checks.spf = spfResult.exists;
  result.details.spfRecord = spfResult.record;

  // Step 5: SMTP and Mailbox Check
  const providerConfig = getProviderConfig(domain);
  let smtpSuccess = false;
  let lastError = null;
  
  for (const mx of mxRecords) {
    try {
      const smtpResult = await performSMTPCheck(mx.exchange, email, domain, providerConfig);
      result.details.smtpResponse = smtpResult;
      
      if (smtpResult.success) {
        result.checks.smtp = true;
        result.checks.mailbox = smtpResult.mailboxExists;
        smtpSuccess = true;
        break;
      } else {
        lastError = smtpResult.error;
      }
    } catch (error) {
      lastError = error.message;
      continue;
    }
  }

  // Final validation check
  result.valid = result.checks.format && 
                 result.checks.dns && 
                 result.checks.mx && 
                 result.checks.mailbox;

  if (!result.valid) {
    if (!result.checks.mailbox) {
      result.reason = 'Mailbox does not exist';
    } else if (!result.checks.smtp) {
      result.reason = `SMTP verification failed: ${lastError || 'Unknown error'}`;
    } else if (!result.checks.mx) {
      result.reason = 'No mail servers found for domain';
    } else if (!result.checks.dns) {
      result.reason = 'Domain does not exist';
    } else {
      result.reason = 'One or more validation checks failed';
    }
  } else {
    result.reason = 'Email verified successfully';
  }

  return result;
};