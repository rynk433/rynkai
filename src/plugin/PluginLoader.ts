import * as fs from 'fs';
import * as path from 'path';
import type { Plugin, PluginContext } from '../types';

export class PluginLoader {
  private plugins = new Map<string, Plugin>();
  // key: `${pluginName}:${userId}` -> timestamp boleh pakai lagi
  private cooldowns = new Map<string, number>();

  /** Register satu plugin secara manual (tanpa baca dari file) */
  register(plugin: Plugin): void {
    const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
    for (const cmd of commands) {
      this.plugins.set(cmd.toLowerCase(), plugin);
    }
  }

  /**
   * Load semua file .js/.ts di sebuah folder sebagai plugin.
   * Tiap file harus `export default` object yang match interface Plugin,
   * atau `module.exports = {...}` (kompatibel dengan gaya rynk4 lama).
   */
  async loadFromDirectory(dir: string): Promise<number> {
    if (!fs.existsSync(dir)) {
      throw new Error(`Plugin directory tidak ditemukan: ${dir}`);
    }

    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.ts'));
    let count = 0;

    for (const file of files) {
      const fullPath = path.join(dir, file);
      delete require.cache[require.resolve(fullPath)];
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require(fullPath);
      const plugin: Plugin = mod.default || mod;

      if (!plugin?.name || !plugin?.command || typeof plugin.execute !== 'function') {
        console.warn(`[rynkai] Melewati "${file}": tidak sesuai format Plugin (butuh name, command, execute)`);
        continue;
      }

      this.register(plugin);
      count++;
    }

    return count;
  }

  /** Cari plugin berdasarkan nama command (tanpa prefix) */
  find(command: string): Plugin | undefined {
    return this.plugins.get(command.toLowerCase());
  }

  /** Cek & catat cooldown. Return sisa detik kalau masih kena cooldown, 0 kalau boleh jalan. */
  checkCooldown(plugin: Plugin, userId: string): number {
    if (!plugin.cooldown) return 0;

    const key = `${plugin.name}:${userId}`;
    const readyAt = this.cooldowns.get(key) || 0;
    const now = Date.now();

    if (now < readyAt) {
      return Math.ceil((readyAt - now) / 1000);
    }

    this.cooldowns.set(key, now + plugin.cooldown * 1000);
    return 0;
  }

  /** Jalankan plugin yang cocok untuk sebuah context. Return true kalau ada plugin yang dieksekusi. */
  async execute(command: string, ctx: PluginContext): Promise<boolean> {
    const plugin = this.find(command);
    if (!plugin) return false;

    const remaining = this.checkCooldown(plugin, ctx.message.sender);
    if (remaining > 0) {
      await ctx.reply(`Tunggu ${remaining} detik lagi sebelum pakai perintah ini lagi.`);
      return true;
    }

    await plugin.execute(ctx);
    return true;
  }

  list(): Plugin[] {
    return [...new Set(this.plugins.values())];
  }
}
