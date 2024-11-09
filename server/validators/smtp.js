import net from 'net';
import tls from 'tls';

const TIMEOUT = 10000;

class SMTPClient {
  constructor(options = {}) {
    this.options = {
      port: 25,
      timeout: TIMEOUT,
      ...options
    };
    this.socket = null;
  }

  async connect(host) {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();
      
      const timeoutId = setTimeout(() => {
        this.cleanup();
        reject(new Error('Connection timeout'));
      }, this.options.timeout);

      this.socket.on('error', (err) => {
        clearTimeout(timeoutId);
        this.cleanup();
        reject(err);
      });

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        resolve();
      });

      this.socket.connect(this.options.port, host);
    });
  }

  async command(cmd = null) {
    return new Promise((resolve, reject) => {
      let response = '';
      
      const timeoutId = setTimeout(() => {
        this.socket.removeAllListeners('data');
        reject(new Error('Response timeout'));
      }, this.options.timeout);

      const handleResponse = (data) => {
        response += data.toString();
        
        // Check for complete SMTP response
        const lines = response.split('\r\n');
        for (const line of lines) {
          if (line.match(/^\d{3}(?:[ -].*)?$/) && !line.match(/^\d{3}-/)) {
            clearTimeout(timeoutId);
            this.socket.removeListener('data', handleResponse);
            
            const code = parseInt(line.substring(0, 3), 10);
            const message = line.substring(4) || '';
            
            resolve({
              code,
              message,
              fullResponse: response
            });
            return;
          }
        }
      };

      this.socket.on('data', handleResponse);

      if (cmd) {
        try {
          this.socket.write(cmd + '\r\n');
        } catch (err) {
          clearTimeout(timeoutId);
          reject(err);
        }
      }
    });
  }

  async upgradeToTLS() {
    return new Promise((resolve, reject) => {
      const tlsOptions = {
        rejectUnauthorized: false,
        socket: this.socket
      };

      const tlsSocket = tls.connect(tlsOptions, () => {
        this.socket = tlsSocket;
        resolve(true);
      });

      tlsSocket.on('error', (err) => {
        reject(err);
      });
    });
  }

  cleanup() {
    if (this.socket && !this.socket.destroyed) {
      try {
        this.socket.write('QUIT\r\n');
        this.socket.end();
        this.socket.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

export async function verifyMailbox(host, email, domain, config) {
  const client = new SMTPClient({
    timeout: config?.timeout || TIMEOUT
  });
  let supportsTLS = false;

  try {
    // Connect and get greeting
    await client.connect(host);
    const greeting = await client.command();
    if (greeting.code !== 220) {
      throw new Error('Invalid server greeting');
    }

    // Try EHLO/HELO with multiple hostnames
    const heloHosts = [
      config?.heloHost,
      domain,
      host,
      'verify.local'
    ].filter(Boolean);

    let ehloSuccess = false;
    let ehloResponse = null;

    for (const heloHost of heloHosts) {
      try {
        // Try EHLO first
        ehloResponse = await client.command(`EHLO ${heloHost}`);
        if (ehloResponse.code === 250) {
          ehloSuccess = true;
          break;
        }

        // Fallback to HELO
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

    // Try STARTTLS if available
    if (ehloResponse.fullResponse.toLowerCase().includes('starttls')) {
      try {
        const tlsCmd = await client.command('STARTTLS');
        if (tlsCmd.code === 220) {
          await client.upgradeToTLS();
          supportsTLS = true;
          // Re-issue EHLO after TLS upgrade
          await client.command(`EHLO ${heloHosts[0]}`);
        }
      } catch (e) {
        if (config?.requireTLS) {
          throw new Error('Required TLS connection failed');
        }
      }
    }

    // Try multiple FROM addresses
    const fromAddresses = [
      ...(config?.fromAddresses || []),
      `verify@${domain}`,
      `postmaster@${domain}`,
      `check@${domain}`
    ];

    let mailFromSuccess = false;
    let mailFromResponse = null;

    for (const fromAddress of fromAddresses) {
      try {
        mailFromResponse = await client.command(`MAIL FROM:<${fromAddress}>`);
        if (mailFromResponse.code === 250) {
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

    // Verify recipient
    const rcptResponse = await client.command(`RCPT TO:<${email}>`);
    
    return {
      success: true,
      mailboxExists: rcptResponse.code === 250,
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
}