import crypto from "crypto";
import EthCrypto from "eth-crypto";
import pako from "pako";

const metadataCheck =
  "704512f53a4efc15864acc3cf3e4e319cf66d48723acf6bd676c1ae7919a05dc"; // keccak256("VALID MESSAGE") for integrity check
// NOTE : alternatively, this check value could be replaced by bytes32(0) to save gas, especially when using compression

function encryptSymmetricAES(
  message_: string,
  compression_: boolean
): [Buffer, Buffer, Buffer] {
  // Generate a random key
  let AESKey = crypto.randomBytes(32); // AES-256
  // Encrypt the message
  let iv = crypto.randomBytes(16); // Initialization vector
  let cipher = crypto.createCipheriv("aes-256-cbc", AESKey, iv);
  let encrypted: Buffer;
  if (compression_) {
    let input = Buffer.from(message_, "utf-8");
    // Compress the data
    let compressed = pako.deflate(input);
    encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  } else {
    encrypted = Buffer.concat([
      cipher.update(message_, "utf8"),
      cipher.final(),
    ]);
  }
  return [encrypted, AESKey, iv];
}

interface Encrypted {
  iv: string;
  ephemPublicKey: string;
  ciphertext: string;
  mac: string;
}

async function encryptWithPublicKey(AESKey_: string, publicKey: string) {
  const encryptedAES = await EthCrypto.encryptWithPublicKey(
    publicKey,
    AESKey_ // message
  );
  return encryptedAES;
}

async function decryptWithPrivateKeyAndAES(
  encryptedMessage: Buffer,
  encryptedAES: Encrypted,
  privateKey: string,
  compression: boolean
) {
  const decryptedAESIV = await EthCrypto.decryptWithPrivateKey(
    privateKey, // privateKey
    {
      iv: encryptedAES.iv,
      ephemPublicKey: encryptedAES.ephemPublicKey,
      ciphertext: encryptedAES.ciphertext,
      mac: encryptedAES.mac,
    }
  );
  let [decryptedAES, decryptedIV] = decryptedAESIV.split("IV");
  let decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(decryptedAES, "hex"),
    Buffer.from(decryptedIV, "hex")
  );
  let decrypted = Buffer.concat([
    decipher.update(encryptedMessage),
    decipher.final(),
  ]);
  let decrypted_msg: string;
  if (compression) {
    const decompressed_msg = pako.inflate(decrypted);
    decrypted_msg = Buffer.from(decompressed_msg).toString("utf-8");
  } else {
    decrypted_msg = decrypted.toString("utf8");
  }
  let isValid: boolean;
  if (
    decrypted_msg.length >= 64 &&
    decrypted_msg.substring(0, 64) === metadataCheck
  ) {
    isValid = true;
    decrypted_msg = decrypted_msg.slice(64);
  } else {
    isValid = false;
  }
  return [isValid, decrypted_msg];
}

export {
  encryptSymmetricAES,
  encryptWithPublicKey,
  decryptWithPrivateKeyAndAES,
};
