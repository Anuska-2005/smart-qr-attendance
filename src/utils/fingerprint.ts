/**
 * Generates a persistent browser/hardware device fingerprint
 * to protect against duplicate student checkins from the same device.
 */
export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language || '',
    window.screen.width,
    window.screen.height,
    window.screen.colorDepth,
    new Date().getTimezoneOffset(),
    // Canvas fingerprinting for graphic stack variance
    getCanvasFingerprint()
  ];
  
  const rawString = parts.join('|');
  
  // Create a simple, robust hash function (Fowler-Noll-Vo 1a hash algorithm)
  let hash = 0x811c9dc5;
  for (let i = 0; i < rawString.length; i++) {
    hash ^= rawString.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  
  return (hash >>> 0).toString(16);
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Draw text and a subtle path
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('QR_ATTENDANCE_FINGERPRINT', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('QR_ATTENDANCE_FINGERPRINT', 4, 17);
    
    return canvas.toDataURL();
  } catch (e) {
    return 'unsupported-canvas';
  }
}
