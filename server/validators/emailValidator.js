// Previous imports remain the same...

const PROVIDERS = {
  'outlook.com': {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    mxDomains: ['outlook.com', 'hotmail.com', 'microsoft.com'],
    heloHost: 'outlook-com.olc.protection.outlook.com',
    fromAddresses: [
      'postmaster@outlook.com',
      'verify@outlook.com',
      'check@outlook.com'
    ],
    timeout: 20000,
    port: 25,
    requireTLS: true
  }
};

const getProvider = (domain) => {
  const lowerDomain = domain.toLowerCase();
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    if (provider.domains.includes(lowerDomain) || 
        provider.mxDomains.some(mx => lowerDomain.includes(mx))) {
      return { ...provider, key };
    }
  }
  return null;
};

// Rest of the code remains the same until verifyMailbox function...

const verifyMailbox = async (host, email, domain) => {
  const provider = getProvider(domain);
  const client = new SMTPClient({
    port: provider?.port || 25,
    timeout: provider?.timeout || TIMEOUT
  });
  let supportsTLS = false;

  try {
    await client.connect(host);
    const greeting = await client.command();
    if (greeting.code !== 220) {
      throw new Error('Invalid server greeting');
    }

    // Use provider-specific or fallback HELO hosts
    const heloHosts = [
      provider?.heloHost,
      domain,
      host,
      'verify.local',
      'validator.local',
      'example.com'
    ].filter(Boolean);

    let ehloSuccess = false;
    let ehloResponse = null;

    for (const heloHost of heloHosts) {
      try {
        ehloResponse = await client.command(`EHLO ${heloHost}`);
        if (ehloResponse.code === 250) {
          ehloSuccess = true;
          break;
        }

        ehloResponse = await client.command(`HELO ${heloHost}`);
        if (ehloResponse.code === 250) {
          ehloSuccess = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!ehloSuccess) {
      throw new Error('HELO/EHLO failed');
    }

    // Handle TLS for providers that require it
    if (provider?.requireTLS || ehloResponse.fullResponse.toLowerCase().includes('starttls')) {
      try {
        const tlsCmd = await client.command('STARTTLS');
        if (tlsCmd.code === 220) {
          await client.upgradeToTLS();
          supportsTLS = true;
          // Re-issue EHLO after TLS upgrade
          await client.command(`EHLO ${heloHosts[0]}`);
        } else if (provider?.requireTLS) {
          throw new Error('TLS required but not supported');
        }
      } catch (e) {
        if (provider?.requireTLS) {
          throw new Error('TLS connection failed');
        }
      }
    }

    // Use provider-specific or fallback FROM addresses
    const fromAddresses = [
      ...(provider?.fromAddresses || []),
      `verify@${domain}`,
      `postmaster@${domain}`,
      `check@${domain}`,
      'verify@example.com',
      'check@validator.local'
    ];

    let mailFromSuccess = false;
    for (const fromAddress of fromAddresses) {
      try {
        const response = await client.command(`MAIL FROM:<${fromAddress}>`);
        if (response.code === 250) {
          mailFromSuccess = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!mailFromSuccess) {
      throw new Error('MAIL FROM command failed');
    }

    // Special handling for Outlook domains
    if (provider?.key === 'outlook.com') {
      // Add a small delay before RCPT TO for Outlook
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const rcptResponse = await client.command(`RCPT TO:<${email}>`);
    
    // Enhanced response code handling
    const validCodes = [250, 251, 252];
    const invalidCodes = [550, 551, 552, 553, 554];
    const tempFailCodes = [450, 451, 452];

    // Special handling for Outlook's response codes
    if (provider?.key === 'outlook.com') {
      // Outlook sometimes uses temp fail codes for non-existent mailboxes
      if (tempFailCodes.includes(rcptResponse.code) && 
          rcptResponse.message.toLowerCase().includes('not found')) {
        return {
          success: true,
          mailboxExists: false,
          supportsTLS,
          code: rcptResponse.code,
          message: rcptResponse.message
        };
      }
    }

    return {
      success: true,
      mailboxExists: validCodes.includes(rcptResponse.code) || 
                    (tempFailCodes.includes(rcptResponse.code) && 
                     !rcptResponse.message.toLowerCase().includes('not exist') &&
                     !rcptResponse.message.toLowerCase().includes('not found')),
      supportsTLS,
      code: rcptResponse.code,
      message: rcptResponse.message
    };
  } catch (error) {
    return {
      success: false,
      mailboxExists: false,
      supportsTLS,
      error: error.message
    };
  } finally {
    client.cleanup();
  }
};

// Rest of the code remains the same...