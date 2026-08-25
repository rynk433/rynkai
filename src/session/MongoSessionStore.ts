import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import type { AuthenticationState, AuthenticationCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';
// Hanya import TYPE dari mongoose (dihapus total saat compile, tidak ada runtime import).
// Modul mongoose asli di-require secara lazy lewat loadMongoose(), biar orang
// yang tidak pakai MongoSessionStore tidak wajib install mongoose.
import type { Schema as SchemaType, Model, Document } from 'mongoose';
import type { SessionStore } from '../types';

interface SessionDoc extends Document {
  sessionName: string;
  key: string;
  value: string;
}

let SessionModel: Model<SessionDoc> | null = null;

function loadMongoose(): typeof import('mongoose') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('mongoose');
  } catch {
    throw new Error(
      '[rynkai] MongoSessionStore butuh package "mongoose" tapi belum terinstall. ' +
        'Jalankan: npm install mongoose'
    );
  }
}

function getModel(): Model<SessionDoc> {
  if (!SessionModel) {
    const mongoose = loadMongoose();
    const schema: SchemaType<SessionDoc> = new mongoose.Schema({
      sessionName: { type: String, required: true, index: true },
      key: { type: String, required: true },
      value: { type: String, required: true },
    });
    schema.index({ sessionName: 1, key: 1 }, { unique: true });
    SessionModel = mongoose.model<SessionDoc>('RynkaiSession', schema);
  }
  return SessionModel;
}

/**
 * Session store berbasis MongoDB/Mongoose — cocok buat rynk4 atau setup lain
 * yang sudah pakai Mongo dan butuh sesi WA yang persist di database, bukan
 * di filesystem lokal (misal deployment multi-instance atau ephemeral disk).
 *
 * Prasyarat:
 * 1. `npm install mongoose` (tidak ikut ter-install otomatis, biar library
 *    ini tetap ringan buat yang cuma pakai FileSessionStore).
 * 2. Koneksi mongoose sudah dibuka (`mongoose.connect()`) sebelum
 *    `client.connect()` dipanggil — store ini tidak buka koneksi sendiri,
 *    biar konsisten sama koneksi yang dipakai bagian lain aplikasi.
 */
export class MongoSessionStore implements SessionStore {
  constructor(private sessionName: string) {
    // Validasi mongoose ada dari awal, biar error langsung ketauan
    // di constructor, bukan pas load() dipanggil di tengah connect().
    loadMongoose();
  }

  private async getValue<T>(key: string): Promise<T | null> {
    const doc = await getModel().findOne({ sessionName: this.sessionName, key }).lean();
    if (!doc) return null;
    return JSON.parse(doc.value, BufferJSON.reviver) as T;
  }

  private async setValue(key: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value, BufferJSON.replacer);
    await getModel().updateOne(
      { sessionName: this.sessionName, key },
      { $set: { value: serialized } },
      { upsert: true }
    );
  }

  private async deleteValue(key: string): Promise<void> {
    await getModel().deleteOne({ sessionName: this.sessionName, key });
  }

  async load(): Promise<AuthenticationState | null> {
    let creds = await this.getValue<AuthenticationCreds>('creds');
    if (!creds) {
      creds = initAuthCreds();
      await this.setValue('creds', creds);
    }

    const keys: AuthenticationState['keys'] = {
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        await Promise.all(
          ids.map(async (id) => {
            const value = await this.getValue<SignalDataTypeMap[typeof type]>(`${type}-${id}`);
            if (value) {
              result[id] =
                type === 'app-state-sync-key'
                  ? (proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[typeof type])
                  : value;
            }
          })
        );
        return result;
      },
      set: async (data) => {
        const tasks: Promise<void>[] = [];
        for (const type in data) {
          for (const id in data[type as keyof typeof data]) {
            const value = data[type as keyof typeof data]?.[id];
            const key = `${type}-${id}`;
            tasks.push(value ? this.setValue(key, value) : this.deleteValue(key));
          }
        }
        await Promise.all(tasks);
      },
    };

    return { creds, keys };
  }

  async save(state: AuthenticationState): Promise<void> {
    await this.setValue('creds', state.creds);
  }

  async clear(): Promise<void> {
    await getModel().deleteMany({ sessionName: this.sessionName });
  }
}
