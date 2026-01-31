use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;

// ============================================================================
// PRIVATE MESSAGES - Solana Program
// ============================================================================
//
// Ce programme gère les messages privés chiffrés sur Solana.
// Les messages sont chiffrés côté client et stockés on-chain.
// Seul le destinataire peut les déchiffrer avec sa clé privée.
//
// Architecture:
// 1. Chaque utilisateur enregistre sa clé publique X25519
// 2. Pour envoyer un message, on chiffre avec la clé publique du destinataire
// 3. Le message chiffré est stocké dans un PDA
// 4. Le destinataire récupère et déchiffre avec sa clé privée
// ============================================================================

// Offsets pour les définitions de computation Arcium
const COMP_DEF_OFFSET_TEST_ADD: u32 = comp_def_offset("test_add");
const COMP_DEF_OFFSET_VERIFY_AND_REVEAL_SENDER: u32 = comp_def_offset("verify_and_reveal_sender");

declare_id!("A8r4vLoD79gtdwvyHBY7bXzRSXjFNBbuXic9cPHUJa2s");

// Taille maximale du contenu chiffré d'un message (en bytes)
// 256 bytes = ~170 caractères après chiffrement
const MAX_MESSAGE_SIZE: usize = 256;

#[arcium_program]
pub mod private_messages {
    use super::*;

    // ========================================================================
    // USER REGISTRATION
    // ========================================================================

    /// Enregistre un utilisateur avec sa clé publique X25519 pour le chiffrement
    pub fn register_user(
        ctx: Context<RegisterUser>,
        x25519_pubkey: [u8; 32],
    ) -> Result<()> {
        let user = &mut ctx.accounts.user_account;
        user.wallet = ctx.accounts.owner.key();
        user.x25519_pubkey = x25519_pubkey;
        user.message_count = 0;
        user.bump = ctx.bumps.user_account;

        emit!(UserRegistered {
            wallet: user.wallet,
            x25519_pubkey,
        });

        Ok(())
    }

    /// Met à jour la clé publique X25519 d'un utilisateur
    pub fn update_user_key(
        ctx: Context<UpdateUserKey>,
        new_x25519_pubkey: [u8; 32],
    ) -> Result<()> {
        let user = &mut ctx.accounts.user_account;
        user.x25519_pubkey = new_x25519_pubkey;

        emit!(UserKeyUpdated {
            wallet: user.wallet,
            new_x25519_pubkey,
        });

        Ok(())
    }

    // ========================================================================
    // MESSAGING
    // ========================================================================

    /// Envoie un message chiffré à un destinataire
    /// Le message est chiffré côté client avec la clé X25519 du destinataire
    pub fn send_message(
        ctx: Context<SendMessage>,
        encrypted_content: Vec<u8>,
        nonce: [u8; 24],  // Nonce pour XChaCha20-Poly1305 ou similaire
    ) -> Result<()> {
        require!(
            encrypted_content.len() <= MAX_MESSAGE_SIZE,
            ErrorCode::MessageTooLong
        );

        let message = &mut ctx.accounts.message_account;
        message.sender = ctx.accounts.sender.key();
        message.recipient = ctx.accounts.recipient_user.wallet;
        message.encrypted_content = encrypted_content;
        message.nonce = nonce;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.is_read = false;
        message.bump = ctx.bumps.message_account;

        // Incrémente le compteur de messages du destinataire
        let recipient_user = &mut ctx.accounts.recipient_user;
        recipient_user.message_count += 1;

        emit!(MessageSent {
            sender: message.sender,
            recipient: message.recipient,
            timestamp: message.timestamp,
            message_index: recipient_user.message_count,
        });

        Ok(())
    }

    /// Marque un message comme lu
    pub fn mark_as_read(ctx: Context<MarkAsRead>) -> Result<()> {
        let message = &mut ctx.accounts.message_account;

        // Vérifie que c'est bien le destinataire qui marque comme lu
        require!(
            ctx.accounts.reader.key() == message.recipient,
            ErrorCode::Unauthorized
        );

        message.is_read = true;

        emit!(MessageRead {
            sender: message.sender,
            recipient: message.recipient,
            timestamp: message.timestamp,
        });

        Ok(())
    }

    // ========================================================================
    // ARCIUM TEST CIRCUIT - Pour vérifier l'intégration MPC
    // ========================================================================

    /// Initialise la définition du circuit test_add
    pub fn init_test_add_comp_def(ctx: Context<InitTestAddCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Teste le circuit MPC avec une simple addition
    pub fn test_add(
        ctx: Context<TestAdd>,
        computation_offset: u64,
        ciphertext_a: [u8; 32],
        ciphertext_b: [u8; 32],
        pubkey: [u8; 32],
        nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let args = ArgBuilder::new()
            .x25519_pubkey(pubkey)
            .plaintext_u128(nonce)
            .encrypted_u8(ciphertext_a)
            .encrypted_u8(ciphertext_b)
            .build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![TestAddCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// Callback pour le résultat du circuit test_add
    #[arcium_callback(encrypted_ix = "test_add")]
    pub fn test_add_callback(
        ctx: Context<TestAddCallback>,
        output: SignedComputationOutputs<TestAddOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(TestAddOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        emit!(TestAddResult {
            result: o.ciphertexts[0],
            nonce: o.nonce.to_le_bytes(),
        });

        Ok(())
    }

    // ========================================================================
    // PRIVATE MESSAGING WITH HIDDEN METADATA (via Arcium MPC)
    // ========================================================================
    //
    // Ces instructions utilisent Arcium pour cacher qui envoie/reçoit les messages.
    // Sur la blockchain on ne voit que des hashes chiffrés.
    // Le MPC vérifie l'accès sans révéler les identités.

    /// Initialise le circuit verify_and_reveal_sender
    pub fn init_verify_sender_comp_def(ctx: Context<InitVerifySenderCompDef>) -> Result<()> {
        init_comp_def(ctx.accounts, None, None)?;
        Ok(())
    }

    /// Envoie un message privé avec métadonnées cachées
    /// sender_hash et recipient_hash sont chiffrés avec la clé du MXE
    /// Personne sur la blockchain ne peut voir qui envoie à qui
    pub fn send_private_message(
        ctx: Context<SendPrivateMessage>,
        message_index: u64,
        // Métadonnées chiffrées (chiffrées avec la clé MXE)
        encrypted_sender_hash: [u8; 32],
        encrypted_recipient_hash: [u8; 32],
        // Contenu du message (chiffré avec la clé X25519 du destinataire)
        encrypted_content: Vec<u8>,
        nonce: [u8; 24],
        // Clé publique éphémère et nonce pour le MPC
        mpc_pubkey: [u8; 32],
        mpc_nonce: u128,
    ) -> Result<()> {
        require!(
            encrypted_content.len() <= MAX_MESSAGE_SIZE,
            ErrorCode::MessageTooLong
        );

        // Stocke le message avec les métadonnées chiffrées
        let message = &mut ctx.accounts.private_message_account;
        message.encrypted_sender_hash = encrypted_sender_hash;
        message.encrypted_recipient_hash = encrypted_recipient_hash;
        message.encrypted_content = encrypted_content;
        message.nonce = nonce;
        message.timestamp = Clock::get()?.unix_timestamp;
        message.mpc_pubkey = mpc_pubkey;
        message.mpc_nonce = mpc_nonce;
        message.bump = ctx.bumps.private_message_account;

        // Incrémente le compteur global de messages privés
        ctx.accounts.private_message_counter.count += 1;

        emit!(PrivateMessageSent {
            message_index,
            timestamp: message.timestamp,
            // Note: on n'émet PAS sender/recipient car c'est justement ce qu'on cache!
        });

        Ok(())
    }

    /// Vérifie l'accès à un message privé via MPC
    /// Le MPC compare le hash du requester avec le recipient_hash chiffré
    /// Retourne 1 si autorisé, 0 sinon (chiffré)
    pub fn verify_private_message_access(
        ctx: Context<VerifyPrivateMessageAccess>,
        computation_offset: u64,
        // Hash chiffré du requester (celui qui veut lire)
        encrypted_requester_hash: [u8; 32],
        mpc_pubkey: [u8; 32],
        mpc_nonce: u128,
    ) -> Result<()> {
        ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

        let message = &ctx.accounts.private_message_account;

        // Construit les arguments pour le circuit verify_and_reveal_sender
        // AccessCheck { recipient_hash, requester_hash }
        let builder = ArgBuilder::new()
            .x25519_pubkey(mpc_pubkey)
            .plaintext_u128(mpc_nonce)
            // recipient_hash (32 bytes encrypted) - from message
            .encrypted_u8(message.encrypted_recipient_hash)
            // requester_hash (32 bytes encrypted) - from caller
            .encrypted_u8(encrypted_requester_hash);

        let args = builder.build();

        queue_computation(
            ctx.accounts,
            computation_offset,
            args,
            None,
            vec![VerifyAndRevealSenderCallback::callback_ix(
                computation_offset,
                &ctx.accounts.mxe_account,
                &[],
            )?],
            1,
            0,
        )?;

        Ok(())
    }

    /// Callback pour verify_private_message_access
    /// Émet un event avec le résultat (1 = autorisé, 0 = non autorisé)
    #[arcium_callback(encrypted_ix = "verify_and_reveal_sender")]
    pub fn verify_and_reveal_sender_callback(
        ctx: Context<VerifyAndRevealSenderCallback>,
        output: SignedComputationOutputs<VerifyAndRevealSenderOutput>,
    ) -> Result<()> {
        let result = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(VerifyAndRevealSenderOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        // Le résultat contient is_authorized (1 byte chiffré)
        // Le requester peut le déchiffrer avec sa clé
        emit!(PrivateAccessVerified {
            encrypted_result: result.ciphertexts[0],
            nonce: result.nonce.to_le_bytes(),
        });

        Ok(())
    }
}

// ============================================================================
// ACCOUNT STRUCTURES
// ============================================================================

/// Compte utilisateur - stocke la clé publique X25519 pour le chiffrement
#[account]
pub struct UserAccount {
    /// Wallet Solana de l'utilisateur
    pub wallet: Pubkey,
    /// Clé publique X25519 pour le chiffrement des messages
    pub x25519_pubkey: [u8; 32],
    /// Nombre de messages reçus
    pub message_count: u64,
    /// Bump pour le PDA
    pub bump: u8,
}

impl UserAccount {
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

/// Compte message - stocke un message chiffré
#[account]
pub struct MessageAccount {
    /// Expéditeur du message
    pub sender: Pubkey,
    /// Destinataire du message
    pub recipient: Pubkey,
    /// Contenu chiffré (max 256 bytes)
    pub encrypted_content: Vec<u8>,
    /// Nonce utilisé pour le chiffrement
    pub nonce: [u8; 24],
    /// Timestamp Unix
    pub timestamp: i64,
    /// Message lu ou non
    pub is_read: bool,
    /// Bump pour le PDA
    pub bump: u8,
}

impl MessageAccount {
    // 8 (discriminator) + 32 + 32 + 4 + 256 + 24 + 8 + 1 + 1
    pub const SIZE: usize = 8 + 32 + 32 + 4 + MAX_MESSAGE_SIZE + 24 + 8 + 1 + 1;
}

/// Message privé avec métadonnées cachées (via Arcium MPC)
/// Les identités sender/recipient sont hashées et chiffrées
#[account]
pub struct PrivateMessageAccount {
    /// Hash chiffré du sender (personne ne peut voir qui a envoyé)
    pub encrypted_sender_hash: [u8; 32],
    /// Hash chiffré du recipient (personne ne peut voir qui reçoit)
    pub encrypted_recipient_hash: [u8; 32],
    /// Contenu chiffré (avec la clé X25519 du destinataire)
    pub encrypted_content: Vec<u8>,
    /// Nonce pour le chiffrement du contenu
    pub nonce: [u8; 24],
    /// Timestamp (seule métadonnée publique)
    pub timestamp: i64,
    /// Clé publique MPC utilisée pour chiffrer les métadonnées
    pub mpc_pubkey: [u8; 32],
    /// Nonce MPC
    pub mpc_nonce: u128,
    /// Bump pour le PDA
    pub bump: u8,
}

impl PrivateMessageAccount {
    // 8 (disc) + 32 + 32 + 4 + 256 + 24 + 8 + 32 + 16 + 1
    pub const SIZE: usize = 8 + 32 + 32 + 4 + MAX_MESSAGE_SIZE + 24 + 8 + 32 + 16 + 1;
}

/// Compteur global de messages privés
#[account]
pub struct PrivateMessageCounter {
    pub count: u64,
    pub bump: u8,
}

impl PrivateMessageCounter {
    pub const SIZE: usize = 8 + 8 + 1;
}

// ============================================================================
// CONTEXT STRUCTURES
// ============================================================================

#[derive(Accounts)]
pub struct RegisterUser<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = UserAccount::SIZE,
        seeds = [b"user", owner.key().as_ref()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateUserKey<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"user", owner.key().as_ref()],
        bump = user_account.bump,
        // La contrainte seeds garantit déjà que owner == wallet
    )]
    pub user_account: Account<'info, UserAccount>,
}

#[derive(Accounts)]
#[instruction(encrypted_content: Vec<u8>, nonce: [u8; 24])]
pub struct SendMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    /// Le compte utilisateur du destinataire (pour récupérer sa clé publique)
    #[account(
        mut,
        seeds = [b"user", recipient_user.wallet.as_ref()],
        bump = recipient_user.bump
    )]
    pub recipient_user: Account<'info, UserAccount>,

    /// Le PDA pour stocker le message
    /// Seeds: ["message", sender, recipient, message_count]
    #[account(
        init,
        payer = sender,
        space = MessageAccount::SIZE,
        seeds = [
            b"message",
            sender.key().as_ref(),
            recipient_user.wallet.as_ref(),
            &recipient_user.message_count.to_le_bytes()
        ],
        bump
    )]
    pub message_account: Account<'info, MessageAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MarkAsRead<'info> {
    pub reader: Signer<'info>,

    #[account(
        mut,
        constraint = message_account.recipient == reader.key() @ ErrorCode::Unauthorized
    )]
    pub message_account: Account<'info, MessageAccount>,
}

// ============================================================================
// ARCIUM COMPUTATION CONTEXTS
// ============================================================================

#[init_computation_definition_accounts("test_add", payer)]
#[derive(Accounts)]
pub struct InitTestAddCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("test_add", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct TestAdd<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_TEST_ADD))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("test_add")]
#[derive(Accounts)]
pub struct TestAddCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_TEST_ADD))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

// ============================================================================
// PRIVATE MESSAGE CONTEXTS (with hidden metadata)
// ============================================================================

#[init_computation_definition_accounts("verify_and_reveal_sender", payer)]
#[derive(Accounts)]
pub struct InitVerifySenderCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program
    pub comp_def_account: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    message_index: u64,
    encrypted_sender_hash: [u8; 32],
    encrypted_recipient_hash: [u8; 32],
    encrypted_content: Vec<u8>,
    nonce: [u8; 24],
)]
pub struct SendPrivateMessage<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,

    /// Compteur global de messages privés
    #[account(
        init_if_needed,
        payer = sender,
        space = PrivateMessageCounter::SIZE,
        seeds = [b"private_message_counter"],
        bump
    )]
    pub private_message_counter: Account<'info, PrivateMessageCounter>,

    /// Le message privé - utilise le message_index passé en paramètre
    #[account(
        init,
        payer = sender,
        space = PrivateMessageAccount::SIZE,
        seeds = [
            b"private_message",
            sender.key().as_ref(),
            &message_index.to_le_bytes()
        ],
        bump
    )]
    pub private_message_account: Account<'info, PrivateMessageAccount>,

    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("verify_and_reveal_sender", payer)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct VerifyPrivateMessageAccess<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Le message privé à vérifier
    pub private_message_account: Account<'info, PrivateMessageAccount>,

    #[account(
        init_if_needed,
        space = 9,
        payer = payer,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Account<'info, ArciumSignerAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VERIFY_AND_REVEAL_SENDER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    pub pool_account: Account<'info, FeePool>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    pub clock_account: Account<'info, ClockAccount>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("verify_and_reveal_sender")]
#[derive(Accounts)]
pub struct VerifyAndRevealSenderCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_VERIFY_AND_REVEAL_SENDER))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar
    pub instructions_sysvar: AccountInfo<'info>,
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
pub struct UserRegistered {
    pub wallet: Pubkey,
    pub x25519_pubkey: [u8; 32],
}

#[event]
pub struct UserKeyUpdated {
    pub wallet: Pubkey,
    pub new_x25519_pubkey: [u8; 32],
}

#[event]
pub struct MessageSent {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub timestamp: i64,
    pub message_index: u64,
}

#[event]
pub struct MessageRead {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct TestAddResult {
    pub result: [u8; 32],
    pub nonce: [u8; 16],
}

/// Event émis quand un message privé est envoyé
/// Note: on n'émet PAS sender/recipient car c'est ce qu'on cache!
#[event]
pub struct PrivateMessageSent {
    pub message_index: u64,
    pub timestamp: i64,
}

/// Event émis après vérification d'accès via MPC
/// Le résultat est chiffré - seul le requester peut le déchiffrer
#[event]
pub struct PrivateAccessVerified {
    /// Résultat chiffré (is_authorized + sender_hash si autorisé)
    pub encrypted_result: [u8; 32],
    pub nonce: [u8; 16],
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Message content exceeds maximum size")]
    MessageTooLong,
    #[msg("Unauthorized action")]
    Unauthorized,
}
