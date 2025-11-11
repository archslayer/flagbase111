// Logger with PII/secret redaction
interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVELS: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Patterns to redact from logs
const REDACTION_PATTERNS = [
  // Private keys
  /private[_-]?key[:\s]*([a-fA-F0-9]{64})/gi,
  /0x[a-fA-F0-9]{64}/g,
  
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  
  // API keys
  /api[_-]?key[:\s]*([a-zA-Z0-9_-]{20,})/gi,
  /secret[:\s]*([a-zA-Z0-9_-]{20,})/gi,
  
  // Database URLs
  /mongodb\+srv:\/\/[^:]+:[^@]+@[^\/]+\/[^?]+/gi,
  /postgres:\/\/[^:]+:[^@]+@[^\/]+\/[^?]+/gi,
  
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  
  // Phone numbers
  /\+?[1-9]\d{1,14}/g,
  
  // Credit card numbers
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  
  // Social security numbers
  /\b\d{3}-\d{2}-\d{4}\b/g,
  
  // IP addresses (optional - might want to keep for debugging)
  // /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
];

function redactSensitiveData(message: string): string {
  let redacted = message;
  
  for (const pattern of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  
  return redacted;
}

function formatLogMessage(level: string, message: string, meta?: any): string {
  const timestamp = new Date().toISOString();
  const redactedMessage = redactSensitiveData(message);
  
  let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${redactedMessage}`;
  
  if (meta) {
    const redactedMeta = redactSensitiveData(JSON.stringify(meta));
    logMessage += ` | Meta: ${redactedMeta}`;
  }
  
  return logMessage;
}

export class Logger {
  private context: string;
  
  constructor(context: string = 'FlagWars') {
    this.context = context;
  }
  
  error(message: string, meta?: any): void {
    const logMessage = formatLogMessage(LOG_LEVELS.ERROR, message, meta);
    console.error(`[${this.context}] ${logMessage}`);
  }
  
  warn(message: string, meta?: any): void {
    const logMessage = formatLogMessage(LOG_LEVELS.WARN, message, meta);
    console.warn(`[${this.context}] ${logMessage}`);
  }
  
  info(message: string, meta?: any): void {
    const logMessage = formatLogMessage(LOG_LEVELS.INFO, message, meta);
    console.info(`[${this.context}] ${logMessage}`);
  }
  
  debug(message: string, meta?: any): void {
    const logMessage = formatLogMessage(LOG_LEVELS.DEBUG, message, meta);
    console.debug(`[${this.context}] ${logMessage}`);
  }
}

// Default logger instance
export const logger = new Logger();

// Helper function to create context-specific loggers
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Test function to verify redaction works
export function testRedaction(): void {
  const testData = {
    privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    apiKey: 'sk-1234567890abcdef1234567890abcdef',
    dbUrl: 'mongodb+srv://user:password@cluster.mongodb.net/database',
    email: 'user@example.com',
    phone: '+1234567890'
  };
  
  logger.info('Testing redaction', testData);
}
