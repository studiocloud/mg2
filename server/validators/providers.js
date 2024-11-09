import net from 'net';
import { verifyMailbox } from './smtp.js';

const PROVIDERS = {
  'gmail.com': {
    domains: ['gmail.com', 'googlemail.com'],
    mxDomains: ['google.com', 'googlemail.com', 'gmail.com'],
    reliable: true,
    heloHost: 'gmail-smtp-in.l.google.com',
    verifyMailbox: true,
    requireTLS: true,
    timeout: 15000,
    acceptCodes: [250],
    rejectCodes: [550, 551, 552, 553, 554],
    retryAttempts: 2,
    fromAddresses: [
      'postmaster@gmail.com',
      'verify@gmail.com'
    ]
  },
  'outlook.com': {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    mxDomains: ['outlook.com', 'hotmail.com', 'microsoft.com'],
    reliable: true,
    heloHost: 'outlook-com.olc.protection.outlook.com',
    verifyMailbox: true,
    requireTLS: true,
    timeout: 20000,
    acceptCodes: [250],
    rejectCodes: [550, 551, 552, 553, 554],
    retryAttempts: 3,
    fromAddresses: [
      'postmaster@outlook.com',
      'verify@outlook.com'
    ]
  },
  'yahoo.com': {
    domains: ['yahoo.com', 'ymail.com'],
    mxDomains: ['yahoo.com', 'yahoodns.net'],
    reliable: true,
    heloHost: 'mta7.am0.yahoodns.net',
    verifyMailbox: true,
    requireTLS: true,
    timeout: 12000,
    acceptCodes: [250],
    rejectCodes: [550, 551, 552, 553, 554],
    retryAttempts: 2,
    fromAddresses: [
      'postmaster@yahoo.com',
      'verify@yahoo.com'
    ]
  }
};

export const getProviderConfig = (domain) => {
  const lowerDomain = domain.toLowerCase();
  
  // Check exact domain matches
  for (const [provider, config] of Object.entries(PROVIDERS)) {
    if (config.domains.includes(lowerDomain)) {
      return { ...config, provider };
    }
  }
  
  // Check MX domain patterns
  for (const [provider, config] of Object.entries(PROVIDERS)) {
    if (config.mxDomains.some(mxDomain => lowerDomain.includes(mxDomain))) {
      return { ...config, provider };
    }
  }
  
  // Generic provider configuration
  return {
    reliable: false,
    verifyMailbox: true,
    requireTLS: false,
    timeout: 10000,
    acceptCodes: [250, 251],
    rejectCodes: [550, 551, 553, 554],
    tempCodes: [450, 451, 452],
    retryAttempts: 2
  };
};

export const performSMTPCheck = async (mxServer, email, domain, providerConfig = null) => {
  const config = providerConfig || getProviderConfig(domain);
  let lastError = null;
  
  for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
    try {
      // Test basic connection first
      const socket = new net.Socket();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        }, 5000);

        socket.connect(25, mxServer, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve(true);
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          socket.destroy();
          reject(err);
        });
      });

      // Perform full mailbox verification
      const result = await verifyMailbox(mxServer, email, domain, config);
      
      if (result.success) {
        // Handle successful verification
        if (config.acceptCodes.includes(result.code)) {
          return {
            success: true,
            mailboxExists: true,
            supportsTLS: result.supportsTLS,
            code: result.code,
            message: result.message
          };
        }
        
        // Handle rejection codes
        if (config.rejectCodes.includes(result.code)) {
          return {
            success: true,
            mailboxExists: false,
            supportsTLS: result.supportsTLS,
            code: result.code,
            message: result.message
          };
        }
        
        // Handle temporary failures for generic providers
        if (!config.reliable && config.tempCodes?.includes(result.code)) {
          return {
            success: true,
            mailboxExists: true,
            supportsTLS: result.supportsTLS,
            code: result.code,
            message: 'Server employs protection measures',
            protected: true
          };
        }
      }
      
      lastError = result.error || 'Ambiguous server response';
    } catch (error) {
      lastError = error.message;
      if (attempt < config.retryAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  return {
    success: false,
    mailboxExists: false,
    error: lastError || 'Maximum retry attempts exceeded'
  };
};