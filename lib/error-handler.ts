// Error translation for user-friendly messages
export function translateContractError(error: any, language: string = 'en'): string {
  if (!error) return 'Unknown error occurred';
  
  const errorMessage = error.message || error.toString();
  
  // Common contract error patterns
  const errorPatterns = {
    'insufficient funds': 'Insufficient funds for transaction',
    'user rejected': 'Transaction was rejected by user',
    'gas required exceeds allowance': 'Insufficient gas for transaction',
    'execution reverted': 'Transaction failed - contract execution reverted',
    'nonce too low': 'Transaction nonce is too low',
    'already known': 'Transaction already exists',
    'replacement transaction underpriced': 'Transaction fee too low',
    'intrinsic gas too low': 'Gas limit too low',
    'max fee per gas less than block base fee': 'Gas price too low',
    'insufficient balance for transfer': 'Insufficient balance for transfer',
    'transfer amount exceeds allowance': 'Transfer amount exceeds allowance',
    'ERC20: transfer amount exceeds balance': 'Insufficient token balance',
    'ERC20: transfer amount exceeds allowance': 'Insufficient token allowance',
    'Ownable: caller is not the owner': 'Only contract owner can perform this action',
    'Pausable: paused': 'Contract is currently paused',
    'ReentrancyGuard: reentrant call': 'Reentrancy protection triggered',
    'SafeERC20: low-level call failed': 'Token transfer failed',
    'SafeERC20: ERC20 operation did not succeed': 'Token operation failed'
  };
  
  // Find matching error pattern
  for (const [pattern, message] of Object.entries(errorPatterns)) {
    if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
      return message;
    }
  }
  
  // If no pattern matches, return a generic message
  return `Transaction failed: ${errorMessage}`;
}

// Helper function to check if error is user rejection
export function isUserRejection(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  return errorMessage.toLowerCase().includes('user rejected') || 
         errorMessage.toLowerCase().includes('user denied');
}

// Helper function to check if error is gas related
export function isGasError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  return errorMessage.toLowerCase().includes('gas') || 
         errorMessage.toLowerCase().includes('fee');
}

// Helper function to check if error is balance related
export function isBalanceError(error: any): boolean {
  const errorMessage = error?.message || error?.toString() || '';
  return errorMessage.toLowerCase().includes('insufficient') || 
         errorMessage.toLowerCase().includes('balance') ||
         errorMessage.toLowerCase().includes('allowance');
}
