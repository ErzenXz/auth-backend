import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

/**
 * A service for managing cache operations using a cache manager.
 *
 * This class provides methods to set, retrieve, delete, and clear cache entries
 * using the injected cache manager. It abstracts the underlying cache implementation
 * to facilitate efficient data storage and retrieval.
 */
@Injectable()
export class XCacheService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  /**
   * Sets a value in the cache with the specified key.
   *
   * @param {string} key - The key under which the value will be stored in the cache.
   * @param {any} value - The value to be cached.
   * @returns {Promise<void>} A promise that resolves when the value has been set in the cache.
   */
  async setCache(key: string, value: any): Promise<void> {
    await this.cacheManager.set(key, value);
  }

  /**
   * Retrieves a value from the cache by its key.
   *
   * @param {string} key - The key of the cached value to retrieve.
   * @returns {Promise<any>} A promise that resolves to the cached value, or undefined if not found.
   */
  async getCache(key: string): Promise<any> {
    return await this.cacheManager.get(key);
  }

  /**
   * Deletes a value from the cache by its key.
   *
   * @param {string} key - The key of the cached value to delete.
   * @returns {Promise<void>} A promise that resolves when the value has been deleted from the cache.
   */
  async delCache(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Clears all entries from the cache.
   *
   * @returns {Promise<void>} A promise that resolves when the cache has been cleared.
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.reset();
  }
}
