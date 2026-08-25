import { useMultiFileAuthState, type AuthenticationState } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';
import type { SessionStore } from '../types';

/**
 * Session store default: simpan auth state sebagai file JSON di disk,
 * satu folder per sesi. Cocok buat single-instance bot / development.
 * Untuk multi-instance atau deployment yang butuh shared state, buat
 * SessionStore custom (misal MongoSessionStore) yang implement interface yang sama.
 */
export class FileSessionStore implements SessionStore {
  private folder: string;
  // Baileys expose saveCreds sebagai closure dari useMultiFileAuthState,
  // kita simpan referensinya di sini setelah load() pertama dipanggil.
  private saveCreds: (() => Promise<void>) | null = null;

  constructor(sessionName: string, baseDir = '.rynkai-sessions') {
    this.folder = path.join(baseDir, sessionName);
  }

  async load(): Promise<AuthenticationState | null> {
    const { state, saveCreds } = await useMultiFileAuthState(this.folder);
    this.saveCreds = saveCreds;
    return state;
  }

  async save(_state: AuthenticationState): Promise<void> {
    // useMultiFileAuthState sudah otomatis nulis ke disk tiap kali keys/creds
    // berubah lewat event 'creds.update' — kita cukup panggil saveCreds
    // yang di-provide-nya. Lihat ConnectionManager untuk pemanggilannya.
    if (this.saveCreds) {
      await this.saveCreds();
    }
  }

  async clear(): Promise<void> {
    if (fs.existsSync(this.folder)) {
      fs.rmSync(this.folder, { recursive: true, force: true });
    }
    this.saveCreds = null;
  }
}
