import { TransactionBlock } from "@mysten/sui.js/transactions";
import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { genAddressSeed, getZkLoginSignature } from "@mysten/zklogin";
import { SerializedSignature } from "@mysten/sui.js/cryptography";
import { Account } from "@/types";
import { suiClient } from "@/config/sui";
import { moveCallMintNft } from "@/libs/txb";

export const moveCallSponsoredMint = async (
  txb: TransactionBlock,
  account: Account
) => {
  txb.setSender(account.userAddr);
  moveCallMintNft(txb, {
    name: "Mercari Proof Success NFT",
    description: "Mercoin Hackathon",
    url: "ipfs://Qmdrhha1ncgkrxpU7Hh6FkmHvGLgsMKcWKzHhMmKBudrqT",
  });
  const payloadBytes = await txb.build({
    client: suiClient,
    onlyTransactionKind: true,
  });

  const res = await fetch("/api/sponsor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payloadBytes: Buffer.from(payloadBytes).toString("hex"),
      userAddress: account.userAddr,
    }),
  });
  const sponsoredResponse = await res.json();

  console.log("sponsoredResponse", sponsoredResponse);

  const gaslessTxb = TransactionBlock.from(sponsoredResponse.txBytes);

  console.log({ gaslessTxb });

  const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
    Buffer.from(account.ephemeralPrivateKey, "base64")
  );
  const { bytes, signature: userSignature } = await gaslessTxb.sign({
    client: suiClient,
    signer: ephemeralKeyPair,
  });

  const addressSeed = genAddressSeed(
    BigInt(account.userSalt),
    "sub",
    account.sub,
    account.aud
  ).toString();

  console.log({ addressSeed });
  // Serialize the zkLogin signature by combining the ZK proof (inputs), the maxEpoch,
  // and the ephemeral signature (userSignature).
  const zkLoginSignature: SerializedSignature = getZkLoginSignature({
    inputs: {
      ...account.zkProofs,
      addressSeed,
    },
    maxEpoch: account.maxEpoch,
    userSignature,
  });

  // Execute the transaction
  const r = await suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature: [zkLoginSignature, sponsoredResponse.signature],
    requestType: "WaitForLocalExecution",
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  console.log("r", r);

  return r;
};
