
// utils.js

function safeSetLocalStorage(key, value) {
    try {
        const compressed = LZString.compressToUTF16(value);
        localStorage.setItem(key, compressed);
        return true;
    } catch (e) {
        console.error("Storage Error:", e);
        return false;
    }
}

function safeGetLocalStorage(key) {
    try {
        const compressed = localStorage.getItem(key);
        return LZString.decompressFromUTF16(compressed);
    } catch (e) {
        console.error("Retrieval Error:", e);
        return null;
    }
}
