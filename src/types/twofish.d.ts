declare module "twofish" {
  export function twofish(
    iv?: number[] | Uint8Array
  ): {
    encrypt(userKey: number[] | Uint8Array, plainText: number[] | Uint8Array): number[]
    decrypt(userKey: number[] | Uint8Array, cipherText: number[] | Uint8Array): number[]
    encryptCBC(userKey: number[] | Uint8Array, plainText: number[] | Uint8Array): number[]
    decryptCBC(userKey: number[] | Uint8Array, cipherText: number[] | Uint8Array): number[]
  }
}
