/**
 * DTO 映射工具类型
 * 提供键名转换相关的 TypeScript 工具类型
 */

/**
 * 将字符串键名转换为 camelCase 形式
 * 递归处理嵌套对象和数组
 */
export type CamelCasedKey<S extends string> =
  S extends `${infer Head}_${infer Tail}`
    ? `${Head}${Capitalize<CamelCasedKey<Tail>>}`
    : S;

/**
 * 将字符串键名转换为 snake_case 形式
 */
export type SnakeCasedKey<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? Head extends Uppercase<Head>
      ? Head extends Lowercase<Head>
        ? `${Head}${SnakeCasedKey<Tail>}`
        : `_${Lowercase<Head>}${SnakeCasedKey<Tail>}`
      : `${Head}${SnakeCasedKey<Tail>}`
    : S;

/**
 * 将对象类型的所有键名转换为 camelCase
 */
export type CamelCasedProperties<T> = T extends Array<infer U>
  ? Array<CamelCasedProperties<U>>
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T as CamelCasedKey<K & string>]: CamelCasedProperties<T[K]> }
      : T;

/**
 * 将对象类型的所有键名转换为 snake_case
 */
export type SnakeCasedProperties<T> = T extends Array<infer U>
  ? Array<SnakeCasedProperties<U>>
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T as SnakeCasedKey<K & string>]: SnakeCasedProperties<T[K]> }
      : T;
