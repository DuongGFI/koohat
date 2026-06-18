// Generate a unique 6-digit room PIN.
export function generatePin(isTaken) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    if (!isTaken(pin)) return pin;
  }
  // Extremely unlikely fallback.
  return String(Date.now()).slice(-6);
}
