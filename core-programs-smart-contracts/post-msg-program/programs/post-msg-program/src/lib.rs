use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("5gPGpcXTq1R2chrEP9qPaFw4i1ge5ZgG2n7xnrUGZHPk");

// Revenue split wallets (45% / 10% / 45%)
pub const WALLET_1: Pubkey = pubkey!("69TwH2GJiBSA8Eo3DunPGsXGWjNFY267zRrpHptYWCuC"); // 45%
pub const WALLET_2: Pubkey = pubkey!("EbhZhYumUZyHQCPbeaLLt57SS2obHiFdp7TMLjUBBqcD"); // 10%
pub const WALLET_3: Pubkey = pubkey!("HxtzFZhjNCsQb9ZqEyK8xYftqv6j6AM2MAT6uwWG3KYd"); // 45%

// Minimum lamports to keep in treasury PDA (rent-exempt for 0 bytes = ~890_880 lamports ≈ 0.00089 SOL)
pub const TREASURY_MIN_BALANCE: u64 = 890_880;

// Minimum bid required (0.007 SOL = amount received after Privacy Cash fees from 0.015 SOL deposit)
pub const MIN_BID: u64 = 7_000_000;

#[program]
pub mod post_msg_program {
    use super::*;

    pub fn create_post(ctx: Context<CreatePost>, target: String, content: String, bid: u64) -> Result<()>
    {
        // Validation
        require!(bid >= MIN_BID, PostError::BidTooLow);
        require!(target.len() <= 64, PostError::TargetTooLong);
        require!(content.len() <= 512, PostError::ContentTooLong);

        // Transfer bid from author to PDA treasury
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.author.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            bid,
        )?;

        // Calculate distributable amount (keep rent-exempt minimum in treasury)
        let treasury_balance = ctx.accounts.treasury.lamports();
        let distributable = treasury_balance.saturating_sub(TREASURY_MIN_BALANCE);

        // Only distribute if there's enough to split (skip if treasury is building up minimum)
        if distributable > 0 {
            // Calculate split amounts (45% / 10% / 45%)
            let amount_1 = distributable * 45 / 100;  // 45%
            let amount_2 = distributable * 10 / 100;  // 10%
            let amount_3 = distributable - amount_1 - amount_2;  // Remaining (handles rounding)

            let treasury_bump = ctx.bumps.treasury;
            let seeds = &[b"treasury".as_ref(), &[treasury_bump]];
            let signer_seeds = &[&seeds[..]];

            // Transfer from PDA treasury to wallet 1 (45%)
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.treasury.to_account_info(),
                        to: ctx.accounts.wallet_1.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount_1,
            )?;

            // Transfer from PDA treasury to wallet 2 (10%)
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.treasury.to_account_info(),
                        to: ctx.accounts.wallet_2.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount_2,
            )?;

            // Transfer from PDA treasury to wallet 3 (45%)
            transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.system_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.treasury.to_account_info(),
                        to: ctx.accounts.wallet_3.to_account_info(),
                    },
                    signer_seeds,
                ),
                amount_3,
            )?;
        }

        // Create the post
        ctx.accounts.post.author = ctx.accounts.author.key();
        ctx.accounts.post.target = target;
        ctx.accounts.post.content = content;
        ctx.accounts.post.bid = bid;

        let clock = Clock::get()?;
        ctx.accounts.post.timestamp = clock.unix_timestamp;

        ctx.accounts.post.bump = ctx.bumps.post;
        Ok(())
    }

    // Initialize treasury PDA with rent-exempt minimum (call once)
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            TREASURY_MIN_BALANCE,
        )?;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(target: String)]
pub struct CreatePost<'info>
{
    #[account(mut)]
    pub author: Signer<'info>,

    /// CHECK: PDA treasury - program controlled
    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: AccountInfo<'info>,

    /// CHECK: Revenue wallet 1 (45%) - verified against hardcoded address
    #[account(
        mut,
        constraint = wallet_1.key() == WALLET_1 @ PostError::InvalidWallet
    )]
    pub wallet_1: AccountInfo<'info>,

    /// CHECK: Revenue wallet 2 (10%) - verified against hardcoded address
    #[account(
        mut,
        constraint = wallet_2.key() == WALLET_2 @ PostError::InvalidWallet
    )]
    pub wallet_2: AccountInfo<'info>,

    /// CHECK: Revenue wallet 3 (45%) - verified against hardcoded address
    #[account(
        mut,
        constraint = wallet_3.key() == WALLET_3 @ PostError::InvalidWallet
    )]
    pub wallet_3: AccountInfo<'info>,

    #[account(
        init,
        payer = author,
        space = 8 + 32 + 4 + 64 + 4 + 512 + 8 + 8 + 1,
        seeds = [b"post", author.key().as_ref(), target.as_bytes()],
        bump
    )]
    pub post: Account<'info, Post>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info>
{
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: PDA treasury - program controlled
    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct Post
{
    pub author: Pubkey,
    pub target: String,
    pub content: String,
    pub bid: u64,
    pub timestamp: i64,
    pub bump: u8,
}

#[error_code]
pub enum PostError {
    #[msg("Bid must be at least 0.007 SOL")]
    BidTooLow,
    #[msg("Target too long (max 64 chars)")]
    TargetTooLong,
    #[msg("Content too long (max 512 chars)")]
    ContentTooLong,
    #[msg("Invalid wallet address")]
    InvalidWallet,
}
