import {
  encryptSymmetricAES,
  encryptWithPublicKey,
  decryptWithPrivateKeyAndAES,
} from "./sign";
import EthCrypto from "eth-crypto";

const COMPRESSION = true;

// Define the message which MUST starts with the bytestring corresponding to keccak256("VALID MESSAGE") to let the different actors check the encrypted Metadata before approving the DVP
let message = `704512f53a4efc15864acc3cf3e4e319cf66d48723acf6bd676c1ae7919a05dc
Buyer - Name - Physical Address - LEI
Seller -  Name - Physical  Address - LEI
Asset - Asset Ethereum Address + chainID
Cash - Ethereum Cash Address + chainID
Quantity 
Price
Time
20 - MT202
21 - MT202`;

async function main() {
  //example of hybrid encryption scheme (symmetric+asymmetric)
  let [encryptedMessage, AESKey, iv] = encryptSymmetricAES(
    message,
    COMPRESSION
  ); // Get an encrypted message with a randomly generated AES key

  const privateKeySeller =
    "a68876f6f16efcc9a23b2b14b1783392a47197fe0a8bf5802675f1722165b7ea";
  const publicKeySeller = EthCrypto.publicKeyByPrivateKey(privateKeySeller);

  let encECIES = await encryptWithPublicKey(
    AESKey.toString("hex") + "IV" + iv.toString("hex"),
    publicKeySeller
  ); // encrypts AES with ECIES

  let [isValid, decryptedMessage] = await decryptWithPrivateKeyAndAES(
    encryptedMessage,
    encECIES,
    privateKeySeller,
    COMPRESSION
  );

  console.log("Decrypted message ", decryptedMessage);
}
main(); // test the hybrid cryptosystem

export {
  encryptSymmetricAES,
  encryptWithPublicKey,
  decryptWithPrivateKeyAndAES,
};
