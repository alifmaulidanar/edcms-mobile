// Function to generate unique ID with prefix and timestamp in GMT+7 timezone and 3 random digits
export function generateId(prefix: string): string {
  const epochGmt7 = Date.now() + (7 * 3600000); // Get current epoch time in GMT+7 timezone
  const randomSuffix = Math.floor(100 + Math.random() * 900); // Generate 3 digit random number
  return `${prefix}${epochGmt7}${randomSuffix}`; // Combine prefix, epoch time, and random number
}