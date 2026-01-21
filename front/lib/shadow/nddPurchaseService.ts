/**
 * NDD Purchase Service
 * Flow: Public wallet funds shadow wallet -> Shadow wallet pays 3 revenue wallets (45/10/45) -> Backend verifies
 */

import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Revenue split wallets (45% / 10% / 45%)
const WALLET_1 = new PublicKey('69TwH2GJiBSA8Eo3DunPGsXGWjNFY267zRrpHptYWCuC');
const WALLET_2 = new PublicKey('EbhZhYumUZyHQCPbeaLLt57SS2obHiFdp7TMLjUBBqcD');
const WALLET_3 = new PublicKey('HxtzFZhjNCsQb9ZqEyK8xYftqv6j6AM2MAT6uwWG3KYd');

export interface NddPurchaseResult {
  success: boolean;
  signature?: string;
  error?: string;
}

/**
 * Step 1: Fund shadow wallet from public wallet
 */
export async function fundShadowWallet(
  publicWallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  shadowPubkey: PublicKey,
  amountInSol: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const lamports = Math.floor(amountInSol * LAMPORTS_PER_SOL);

    // Add extra for tx fees + rent-exempt minimum (to avoid "insufficient funds for rent" error)
    // Transaction fee: ~5000 lamports, Rent-exempt minimum: ~890880 lamports
    const lamportsWithFees = lamports + 5000 + 900000; // ~0.000905 SOL extra

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: publicWallet.publicKey,
        toPubkey: shadowPubkey,
        lamports: lamportsWithFees,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicWallet.publicKey;

    const signedTx = await publicWallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return { success: true, signature };
  } catch (error) {
    console.error('Fund shadow wallet error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Step 2: Shadow wallet pays revenue wallets (45% / 10% / 45% split)
 */
export async function shadowPayRevenue(
  shadowKeypair: Keypair,
  amountInSol: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    const connection = new Connection(RPC_URL, 'confirmed');
    const lamports = Math.floor(amountInSol * LAMPORTS_PER_SOL);

    // Calculate split amounts (45% / 10% / 45%)
    const amount1 = Math.floor(lamports * 0.45); // GRINGO
    const amount2 = Math.floor(lamports * 0.10); // GUARDIAN
    const amount3 = lamports - amount1 - amount2; // SACHA (remainder to avoid rounding issues)

    // Create transaction with 3 transfers (atomic)
    const transaction = new Transaction();

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: shadowKeypair.publicKey,
        toPubkey: WALLET_1,
        lamports: amount1,
      })
    );

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: shadowKeypair.publicKey,
        toPubkey: WALLET_2,
        lamports: amount2,
      })
    );

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: shadowKeypair.publicKey,
        toPubkey: WALLET_3,
        lamports: amount3,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = shadowKeypair.publicKey;

    // Shadow wallet signs automatically (we have the keypair)
    transaction.sign(shadowKeypair);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return { success: true, signature };
  } catch (error) {
    console.error('Shadow pay revenue error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Step 3: Verify purchase with backend and assign NDD
 */
export async function verifyAndFinalizePurchase(
  signature: string,
  nddName: string,
  shadowPubkey: string,
  expectedAmount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[NDD] Step 3: Verifying with backend...', { signature, nddName, shadowPubkey, expectedAmount });

    const response = await fetch('/api/?action=api-ndd-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        signature,
        ndd_name: nddName,
        shadow_pubkey: shadowPubkey,
        expected_amount: expectedAmount,
      }),
    });

    const responseText = await response.text();
    console.log('[NDD] Backend raw response:', responseText);

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      console.error('[NDD] Failed to parse JSON:', e);
      return { success: false, error: `Invalid JSON response: ${responseText.substring(0, 200)}` };
    }

    console.log('[NDD] Backend parsed response:', result);
    return { success: result.success, error: result.error };
  } catch (error) {
    console.error('[NDD] Step 3 error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Full purchase flow: Fund -> Pay -> Verify
 */
export async function purchaseNdd(
  publicWallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  shadowKeypair: Keypair,
  nddName: string,
  costInSol: number
): Promise<NddPurchaseResult> {
  try {
    console.log('[NDD] Starting purchase flow for:', nddName, 'at', costInSol, 'SOL');

    // Step 1: Fund shadow wallet
    console.log('[NDD] Step 1: Funding shadow wallet...');
    const fundResult = await fundShadowWallet(publicWallet, shadowKeypair.publicKey, costInSol);
    console.log('[NDD] Step 1 result:', fundResult);
    if (!fundResult.success) {
      return { success: false, error: `Failed to fund shadow wallet: ${fundResult.error}` };
    }

    // Step 2: Shadow wallet pays revenue wallets (split 45/10/45)
    console.log('[NDD] Step 2: Shadow wallet paying revenue wallets...');
    const payResult = await shadowPayRevenue(shadowKeypair, costInSol);
    console.log('[NDD] Step 2 result:', payResult);
    if (!payResult.success) {
      return { success: false, error: `Failed to pay revenue wallets: ${payResult.error}` };
    }

    // Step 3: Verify with backend
    const verifyResult = await verifyAndFinalizePurchase(
      payResult.signature!,
      nddName,
      shadowKeypair.publicKey.toBase58(),
      costInSol
    );
    console.log('[NDD] Step 3 result:', verifyResult);

    if (!verifyResult.success) {
      return { success: false, signature: payResult.signature, error: verifyResult.error };
    }

    console.log('[NDD] Purchase complete!');
    return { success: true, signature: payResult.signature };
  } catch (error) {
    console.error('[NDD] Purchase error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get revenue wallet addresses
 */
export function getRevenueWallets(): { wallet1: string; wallet2: string; wallet3: string } {
  return {
    wallet1: WALLET_1.toBase58(),
    wallet2: WALLET_2.toBase58(),
    wallet3: WALLET_3.toBase58(),
  };
}
