// Web Security Engine for Apex Binary
// Provides XSS sanitization and secure local storage wrapper

class SecurityEngine {
  constructor() {
    this.encryptionKey = 'tycoon_ke_secure_2024';
  }

  // --- Input Sanitization (XSS Protection) ---
  sanitizeInput(str) {
    if (typeof str !== 'string') return str;
    
    // Basic HTML escaping to prevent XSS in text inputs
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      "/": '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return str.replace(reg, (match) => (map[match]));
  }

  // Very basic DOM purifier for dynamic content rendering
  sanitizeHTML(html) {
    if (typeof html !== 'string') return html;
    // Strip all script tags
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Strip on* event handlers
    clean = clean.replace(/ on\w+="[^"]*"/g, '');
    clean = clean.replace(/ on\w+='[^']*'/g, '');
    clean = clean.replace(/ on\w+=\w+/g, '');
    // Strip javascript: uris
    clean = clean.replace(/href="javascript:[^"]*"/gi, 'href="#"');
    return clean;
  }

  // --- Secure Storage Wrapper (Obfuscation) ---
  // Note: True encryption should happen server-side. This obfuscates data in localStorage
  // to prevent casual tampering and protect session tokens.
  setItem(key, value) {
    try {
      const stringValue = JSON.stringify(value);
      const obfuscatedValue = this.obfuscate(stringValue);
      localStorage.setItem(key, obfuscatedValue);
    } catch (e) {
      console.error('Secure Storage Set Error:', e);
    }
  }

  getItem(key) {
    try {
      const rawValue = localStorage.getItem(key);
      if (!rawValue) return null;
      
      const deobfuscatedValue = this.deobfuscate(rawValue);
      return JSON.parse(deobfuscatedValue);
    } catch (e) {
      // Fallback for non-obfuscated legacy data during migration
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (e2) {
        return null;
      }
    }
  }

  removeItem(key) {
    localStorage.removeItem(key);
  }

  // Simple XOR cipher for obfuscation (NOT cryptographically secure, just a barrier)
  obfuscate(str) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
      result += String.fromCharCode(c);
    }
    return btoa(result); // Encode to Base64 to safely store
  }

  deobfuscate(str) {
    let decoded = '';
    try {
      decoded = atob(str);
    } catch (e) {
      return str; // Might not be base64 encoded
    }
    
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      const c = decoded.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
      result += String.fromCharCode(c);
    }
    return result;
  }
}

export const security = new SecurityEngine();
