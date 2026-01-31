import { Keypair } from "@solana/web3.js";
import { createHash } from "crypto";

// ============================================================================
// UTILS - Fonctions utilitaires de base
// ============================================================================

/**
 * Hash SHA-256 d'une chaîne de caractères
 * @param data - Données à hasher
 * @returns Buffer de 32 bytes
 */
function sha256(data: string): Buffer 
{
  return createHash("sha256").update(data).digest();
}

/**
 * Hash le userId pour le stocker en DB sans révéler l'identité
 * @param userId - Identifiant du user (wallet public, email, etc.)
 * @returns Hash hexadécimal du userId (64 caractères)
 */
function hashUserId(userId: string): string 
{
  return sha256(userId).toString("hex");
}

// ============================================================================
// CORE - Génération des shadow wallets
// ============================================================================

/**
 * Dérive une seed de 32 bytes à partir d'une signature et d'un index
 * Cette seed servira à générer un shadow wallet
 * @param signature - Signature du wallet public (preuve de propriété)
 * @param hashedUserId - Hash du userId
 * @param walletIndex - Index du wallet (0, 1, 2...)
 * @returns Seed de 32 bytes
 */
function deriveSeed(signature: string, hashedUserId: string, walletIndex: number): Uint8Array 
{
  const derived = sha256(signature + ":" + hashedUserId + ":" + walletIndex);
  return new Uint8Array(derived);
}

/**
 * Génère un shadow wallet Solana à partir des credentials du user
 * @param signature - Signature du message par le wallet public (preuve de propriété)
 * @param hashedUserId - Hash de l'identifiant unique du user
 * @param walletIndex - Index du shadow wallet (0, 1, 2... pour créer plusieurs wallets)
 * @returns Keypair Solana du shadow wallet
 */
function generateShadowWallet(signature: string, hashedUserId: string, walletIndex: number): Keypair 
{
  const derivedSeed = deriveSeed(signature, hashedUserId, walletIndex);
  const newKeypair = Keypair.fromSeed(derivedSeed);
  return newKeypair;
}

// ============================================================================
// API - Fonctions exposées pour l'utilisation
// ============================================================================

/**
 * Récupère tous les shadow wallets d'un user
 * @param signature - Signature du wallet public
 * @param hashedUserId - Hash du userId
 * @param count - Nombre de wallets à générer (stocké en DB via hashedUserId)
 * @returns Tableau des shadow wallets avec leur index et publicKey
 */
function getShadowWallets(signature: string, hashedUserId: string, count: number) 
{
  let wallets = [];
  for (let i = 0; i < count; i++)
  {
    let newWallet = generateShadowWallet(signature, hashedUserId, i);
    wallets.push({
      index: i,
      publicKey: newWallet.publicKey.toBase58()
    });
  }
  return wallets
}
