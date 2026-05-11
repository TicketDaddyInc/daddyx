use anchor_lang::prelude::*;

declare_id!("D1YJeGTthCfJ6UnKsQzz79fevvKhfRrT3jhiAC8Ct978");

pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;

// ─────────────────────────────────────────────────────────────
// ACCOUNT STRUCTURES
// ─────────────────────────────────────────────────────────────

#[account]
pub struct PlatformConfig {
    pub admin: Pubkey,
    pub platform_fee_bps: u64,
    pub bump: u8,
}

impl PlatformConfig {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

#[account]
pub struct CreatorProfile {
    pub creator: Pubkey,
    pub name: String,         // max 64 chars → 4 + 64
    pub country: String,      // max 32 chars → 4 + 32
    pub email_hash: [u8; 32], // keccak hash of email
    pub applied_at: i64,
    pub approved_at: i64,
    pub event_count: u64,
    pub status: CreatorStatus,
    pub bump: u8,
}

impl CreatorProfile {
    pub const SPACE: usize = 8 + 32 + (4 + 64) + (4 + 32) + 32 + 8 + 8 + 8 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum CreatorStatus {
    Pending,
    Approved,
    Suspended,
}

#[account]
pub struct EventConfig {
    pub organizer: Pubkey,
    pub event_id: [u8; 32],
    pub revenue_share_bps: u64,
    pub initial_price: u64,
    pub step_factor_bps: u64,
    pub payout_factor_bps: u64,
    pub token_count: u64,
    pub end_date: i64,
    pub cancelled: bool,
    pub revenue_reported: bool,
    pub settled_revenue: u64,
    pub oracle: Pubkey,
    pub platform_fee_bps: u64,
    // Campaign fields
    pub campaign_details_uri: String, // max 128 chars → 4 + 128
    pub budget_usd_cents: u64,
    pub organizer_fund_pool: u64,
    pub milestone_1_released: bool,
    pub milestone_2_released: bool,
    pub milestone_3_released: bool,
    pub remedy_type: Remedy,
    pub bump: u8,
}

impl EventConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 1 + 8 + 32 + 8
        + (4 + 128) + 8 + 8 + 1 + 1 + 1 + 1 + 1;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Remedy {
    CancelFullRefund,
    PostponeTransfer,
    PartialRefund,
}

#[account]
pub struct TokenState {
    pub event_config: Pubkey,
    pub token_id: u64,
    pub current_owner: Pubkey,
    pub current_price: u64,
    pub entry_price: u64,
    pub revenue_claimed: bool,
    pub bump: u8,
}

impl TokenState {
    pub const SPACE: usize = 8 + 32 + 8 + 32 + 8 + 8 + 1 + 1;
}

#[account]
pub struct EventEscrow {
    pub event_config: Pubkey,
    pub balance: u64,
    pub bump: u8,
}

impl EventEscrow {
    pub const SPACE: usize = 8 + 32 + 8 + 1;
}

// ─────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────

#[event]
pub struct CreatorApplied {
    pub creator: Pubkey,
    pub name: String,
}

#[event]
pub struct CreatorApprovedEvent {
    pub creator: Pubkey,
    pub approved_by: Pubkey,
}

#[event]
pub struct CreatorSuspendedEvent {
    pub creator: Pubkey,
}

#[event]
pub struct EventInitialized {
    pub event_config: Pubkey,
    pub organizer: Pubkey,
    pub token_count: u64,
    pub initial_price: u64,
}

#[event]
pub struct TokenPurchased {
    pub event: Pubkey,
    pub token_id: u64,
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
    pub purchase_price: u64,
    pub owner_payout: u64,
    pub organizer_amount: u64,
}

#[event]
pub struct PriceRaised {
    pub event: Pubkey,
    pub token_id: u64,
    pub old_price: u64,
    pub new_price: u64,
}

#[event]
pub struct RevenueReported {
    pub event: Pubkey,
    pub revenue: u64,
}

#[event]
pub struct RevenueClaimed {
    pub token_id: u64,
    pub claimer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EventCancelled {
    pub event: Pubkey,
}

#[event]
pub struct MilestoneRequested {
    pub event: Pubkey,
    pub milestone_index: u8,
    pub organizer: Pubkey,
}

#[event]
pub struct MilestoneReleased {
    pub event: Pubkey,
    pub milestone_index: u8,
    pub amount: u64,
    pub organizer: Pubkey,
}

// ─────────────────────────────────────────────────────────────
// ERROR CODES
// ─────────────────────────────────────────────────────────────

#[error_code]
pub enum DaddyXError {
    #[msg("Step factor must be greater than payout factor")]
    InvalidFactors,
    #[msg("Payout factor must be greater than 1 (10000 bps)")]
    PayoutFactorTooLow,
    #[msg("Revenue share cannot exceed 100%")]
    InvalidRevenueShare,
    #[msg("Token count must be between 1 and 10000")]
    InvalidTokenCount,
    #[msg("End date must be in the future")]
    InvalidEndDate,
    #[msg("Not the current token owner")]
    NotOwner,
    #[msg("Event has not ended yet")]
    EventNotEnded,
    #[msg("Revenue already reported")]
    AlreadyReported,
    #[msg("Revenue not yet reported")]
    RevenueNotReported,
    #[msg("Token revenue already claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized caller")]
    Unauthorized,
    #[msg("Incorrect purchase amount")]
    IncorrectAmount,
    #[msg("Event is cancelled")]
    EventCancelled,
    #[msg("Event is not cancelled")]
    EventNotCancelled,
    #[msg("New price must be greater than current price")]
    PriceTooLow,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Not an approved DaddyX Creator — apply at ticketdaddy.io/creator")]
    NotApprovedCreator,
    #[msg("Creator already applied")]
    AlreadyApplied,
    #[msg("Creator not pending")]
    NotPending,
    #[msg("Milestone already released")]
    MilestoneAlreadyReleased,
    #[msg("Invalid milestone index")]
    InvalidMilestoneIndex,
    #[msg("Insufficient escrow balance")]
    InsufficientBalance,
    #[msg("Token already initialized")]
    TokenAlreadyInitialized,
}

// ─────────────────────────────────────────────────────────────
// ACCOUNT CONTEXTS
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = admin,
        space = PlatformConfig::SPACE,
        seeds = [b"platform"],
        bump
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApplyAsCreator<'info> {
    #[account(
        init,
        payer = creator,
        space = CreatorProfile::SPACE,
        seeds = [b"creator", creator.key().as_ref()],
        bump
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveCreator<'info> {
    #[account(
        mut,
        seeds = [b"creator", creator_profile.creator.as_ref()],
        bump = creator_profile.bump
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(
        seeds = [b"platform"],
        bump = platform_config.bump,
        constraint = platform_config.admin == admin.key() @ DaddyXError::Unauthorized
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct SuspendCreator<'info> {
    #[account(
        mut,
        seeds = [b"creator", creator_profile.creator.as_ref()],
        bump = creator_profile.bump
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(
        seeds = [b"platform"],
        bump = platform_config.bump,
        constraint = platform_config.admin == admin.key() @ DaddyXError::Unauthorized
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(event_id: [u8; 32])]
pub struct InitializeEvent<'info> {
    #[account(
        init,
        payer = organizer,
        space = EventConfig::SPACE,
        seeds = [b"event", event_id.as_ref()],
        bump
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        init,
        payer = organizer,
        space = EventEscrow::SPACE,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    #[account(
        mut,
        seeds = [b"creator", organizer.key().as_ref()],
        bump = creator_profile.bump,
        constraint = creator_profile.creator == organizer.key() @ DaddyXError::NotApprovedCreator,
        constraint = creator_profile.status == CreatorStatus::Approved @ DaddyXError::NotApprovedCreator
    )]
    pub creator_profile: Account<'info, CreatorProfile>,
    #[account(mut)]
    pub organizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct PurchaseToken<'info> {
    #[account(
        mut,
        seeds = [b"token", event_config.key().as_ref(), &token_id.to_le_bytes()],
        bump = token_state.bump
    )]
    pub token_state: Account<'info, TokenState>,
    #[account(
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = !event_config.cancelled @ DaddyXError::EventCancelled
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    /// CHECK: previous owner receives payout — validated in handler
    #[account(mut)]
    pub previous_owner: AccountInfo<'info>,
    /// CHECK: organizer receives their share
    #[account(mut, constraint = organizer.key() == event_config.organizer)]
    pub organizer: AccountInfo<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct RaisePrice<'info> {
    #[account(
        mut,
        seeds = [b"token", event_config.key().as_ref(), &token_id.to_le_bytes()],
        bump = token_state.bump,
        constraint = token_state.current_owner == owner.key() @ DaddyXError::NotOwner
    )]
    pub token_state: Account<'info, TokenState>,
    #[account(
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = !event_config.cancelled @ DaddyXError::EventCancelled
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReportRevenue<'info> {
    #[account(
        mut,
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = !event_config.cancelled @ DaddyXError::EventCancelled
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    /// CHECK: organizer for milestone 3 auto-release
    #[account(mut, constraint = organizer.key() == event_config.organizer)]
    pub organizer: AccountInfo<'info>,
    #[account(mut)]
    pub oracle: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct ClaimRevenue<'info> {
    #[account(
        mut,
        seeds = [b"token", event_config.key().as_ref(), &token_id.to_le_bytes()],
        bump = token_state.bump,
        constraint = token_state.current_owner == claimer.key() @ DaddyXError::NotOwner
    )]
    pub token_state: Account<'info, TokenState>,
    #[account(
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = event_config.revenue_reported @ DaddyXError::RevenueNotReported
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelEvent<'info> {
    #[account(
        mut,
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump
    )]
    pub event_config: Account<'info, EventConfig>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct ClaimRefund<'info> {
    #[account(
        mut,
        seeds = [b"token", event_config.key().as_ref(), &token_id.to_le_bytes()],
        bump = token_state.bump,
        constraint = token_state.current_owner == claimer.key() @ DaddyXError::NotOwner
    )]
    pub token_state: Account<'info, TokenState>,
    #[account(
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = event_config.cancelled @ DaddyXError::EventNotCancelled
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    #[account(mut)]
    pub claimer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ── InitializeToken ───────────────────────────────────────────────────────────
// Creates a TokenState PDA for a given token_id on an event.
// Sets current_owner = organizer (initial holder), current_price = initial_price.
// Must be called before purchase_token for each token slot.
#[derive(Accounts)]
#[instruction(token_id: u64)]
pub struct InitializeToken<'info> {
    #[account(
        init,
        payer = payer,
        space = TokenState::SPACE,
        seeds = [b"token", event_config.key().as_ref(), &token_id.to_le_bytes()],
        bump
    )]
    pub token_state: Account<'info, TokenState>,
    #[account(
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = !event_config.cancelled @ DaddyXError::EventCancelled
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestMilestoneRelease<'info> {
    #[account(
        mut,
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump,
        constraint = event_config.organizer == organizer.key() @ DaddyXError::Unauthorized
    )]
    pub event_config: Account<'info, EventConfig>,
    pub organizer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ApproveMilestoneRelease<'info> {
    #[account(
        mut,
        seeds = [b"event", event_config.event_id.as_ref()],
        bump = event_config.bump
    )]
    pub event_config: Account<'info, EventConfig>,
    #[account(
        mut,
        seeds = [b"escrow", event_config.key().as_ref()],
        bump = event_escrow.bump
    )]
    pub event_escrow: Account<'info, EventEscrow>,
    /// CHECK: organizer receives milestone funds
    #[account(mut, constraint = organizer.key() == event_config.organizer)]
    pub organizer: AccountInfo<'info>,
    #[account(
        seeds = [b"platform"],
        bump = platform_config.bump,
        constraint = platform_config.admin == admin.key() @ DaddyXError::Unauthorized
    )]
    pub platform_config: Account<'info, PlatformConfig>,
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─────────────────────────────────────────────────────────────
// PROGRAM
// ─────────────────────────────────────────────────────────────

#[program]
pub mod daddyx {
    use super::*;

    // ── Platform ──────────────────────────────────────────────

    pub fn initialize_platform(ctx: Context<InitializePlatform>, platform_fee_bps: u64) -> Result<()> {
        let config = &mut ctx.accounts.platform_config;
        config.admin = ctx.accounts.admin.key();
        config.platform_fee_bps = platform_fee_bps;
        config.bump = ctx.bumps.platform_config;
        Ok(())
    }

    // ── Creator Program ───────────────────────────────────────

    pub fn apply_as_creator(
        ctx: Context<ApplyAsCreator>,
        name: String,
        country: String,
        email_hash: [u8; 32],
    ) -> Result<()> {
        require!(name.len() <= 64, DaddyXError::InvalidTokenCount);
        require!(country.len() <= 32, DaddyXError::InvalidTokenCount);

        let profile = &mut ctx.accounts.creator_profile;
        profile.creator = ctx.accounts.creator.key();
        profile.name = name.clone();
        profile.country = country;
        profile.email_hash = email_hash;
        profile.applied_at = Clock::get()?.unix_timestamp;
        profile.approved_at = 0;
        profile.event_count = 0;
        profile.status = CreatorStatus::Pending;
        profile.bump = ctx.bumps.creator_profile;

        emit!(CreatorApplied {
            creator: ctx.accounts.creator.key(),
            name,
        });
        Ok(())
    }

    pub fn approve_creator(ctx: Context<ApproveCreator>) -> Result<()> {
        let profile = &mut ctx.accounts.creator_profile;
        require!(profile.status == CreatorStatus::Pending, DaddyXError::NotPending);
        profile.status = CreatorStatus::Approved;
        profile.approved_at = Clock::get()?.unix_timestamp;

        emit!(CreatorApprovedEvent {
            creator: profile.creator,
            approved_by: ctx.accounts.admin.key(),
        });
        Ok(())
    }

    pub fn suspend_creator(ctx: Context<SuspendCreator>) -> Result<()> {
        let profile = &mut ctx.accounts.creator_profile;
        profile.status = CreatorStatus::Suspended;

        emit!(CreatorSuspendedEvent {
            creator: profile.creator,
        });
        Ok(())
    }

    // ── Event Lifecycle ───────────────────────────────────────

    pub fn initialize_event(
        ctx: Context<InitializeEvent>,
        event_id: [u8; 32],
        revenue_share_bps: u64,
        initial_price: u64,
        step_factor_bps: u64,
        payout_factor_bps: u64,
        token_count: u64,
        end_date: i64,
        oracle: Pubkey,
        platform_fee_bps: u64,
        campaign_details_uri: String,
        budget_usd_cents: u64,
        remedy_type: Remedy,
    ) -> Result<()> {
        // Validations
        require!(step_factor_bps > payout_factor_bps, DaddyXError::InvalidFactors);
        require!(payout_factor_bps > 10_000, DaddyXError::PayoutFactorTooLow);
        require!(revenue_share_bps <= 10_000, DaddyXError::InvalidRevenueShare);
        require!(token_count >= 1 && token_count <= 10_000, DaddyXError::InvalidTokenCount);
        require!(end_date > Clock::get()?.unix_timestamp, DaddyXError::InvalidEndDate);
        require!(campaign_details_uri.len() <= 128, DaddyXError::InvalidTokenCount);

        let config = &mut ctx.accounts.event_config;
        config.organizer = ctx.accounts.organizer.key();
        config.event_id = event_id;
        config.revenue_share_bps = revenue_share_bps;
        config.initial_price = initial_price;
        config.step_factor_bps = step_factor_bps;
        config.payout_factor_bps = payout_factor_bps;
        config.token_count = token_count;
        config.end_date = end_date;
        config.cancelled = false;
        config.revenue_reported = false;
        config.settled_revenue = 0;
        config.oracle = oracle;
        config.platform_fee_bps = platform_fee_bps;
        config.campaign_details_uri = campaign_details_uri;
        config.budget_usd_cents = budget_usd_cents;
        config.organizer_fund_pool = 0;
        config.milestone_1_released = false;
        config.milestone_2_released = false;
        config.milestone_3_released = false;
        config.remedy_type = remedy_type;
        config.bump = ctx.bumps.event_config;

        let escrow = &mut ctx.accounts.event_escrow;
        escrow.event_config = ctx.accounts.event_config.key();
        escrow.balance = 0;
        escrow.bump = ctx.bumps.event_escrow;

        // Increment creator event count
        ctx.accounts.creator_profile.event_count += 1;

        emit!(EventInitialized {
            event_config: ctx.accounts.event_config.key(),
            organizer: ctx.accounts.organizer.key(),
            token_count,
            initial_price,
        });

        Ok(())
    }

    // ── Token Operations ──────────────────────────────────────

    /// Initialize a token slot. Must be called once per token_id before purchase_token.
    /// Sets current_owner = organizer (initial holder), current_price = initial_price.
    pub fn initialize_token(ctx: Context<InitializeToken>, token_id: u64) -> Result<()> {
        require!(
            token_id < ctx.accounts.event_config.token_count,
            DaddyXError::InvalidTokenCount
        );
        let token_state = &mut ctx.accounts.token_state;
        token_state.event_config = ctx.accounts.event_config.key();
        token_state.token_id = token_id;
        token_state.current_owner = ctx.accounts.event_config.organizer;
        token_state.current_price = ctx.accounts.event_config.initial_price;
        token_state.entry_price = ctx.accounts.event_config.initial_price;
        token_state.revenue_claimed = false;
        token_state.bump = ctx.bumps.token_state;
        Ok(())
    }

    pub fn purchase_token(ctx: Context<PurchaseToken>, token_id: u64) -> Result<()> {
        let event_key = ctx.accounts.event_config.key();
        let event_config = &mut ctx.accounts.event_config;
        let token_state = &mut ctx.accounts.token_state;
        let event_escrow = &mut ctx.accounts.event_escrow;

        // First purchase (organizer is still initial holder): buyer pays initial_price
        // exactly — no step factor applied, no outbid payout to organizer.
        // Subsequent purchases: step factor drives the new price; previous fan holder
        // receives the guaranteed payout_factor × their purchase price.
        let (purchase_price, owner_payout) =
            if token_state.current_owner == event_config.organizer {
                (event_config.initial_price, 0u64)
            } else {
                let pp = token_state.current_price
                    .checked_mul(event_config.step_factor_bps)
                    .ok_or(DaddyXError::ArithmeticOverflow)?
                    .checked_div(10_000)
                    .ok_or(DaddyXError::ArithmeticOverflow)?;
                let op = token_state.current_price
                    .checked_mul(event_config.payout_factor_bps)
                    .ok_or(DaddyXError::ArithmeticOverflow)?
                    .checked_div(10_000)
                    .ok_or(DaddyXError::ArithmeticOverflow)?;
                (pp, op)
            };

        // Platform fee: purchase_price * platform_fee_bps / 10000
        let platform_fee = purchase_price
            .checked_mul(event_config.platform_fee_bps)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Organizer amount: purchase_price - owner_payout - platform_fee
        let organizer_amount = purchase_price
            .checked_sub(owner_payout)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_sub(platform_fee)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        let previous_owner = ctx.accounts.previous_owner.key();
        let new_owner = ctx.accounts.buyer.key();

        // Transfer purchase_price from buyer to program (escrow proxy via system program)
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: event_escrow.to_account_info(),
                },
            ),
            purchase_price,
        )?;

        // Pay out previous owner from escrow
        **event_escrow.to_account_info().try_borrow_mut_lamports()? -= owner_payout;
        **ctx.accounts.previous_owner.try_borrow_mut_lamports()? += owner_payout;

        // Pay organizer amount goes to organizer_fund_pool tracked in EventConfig
        // (actual lamports stay in escrow, pool tracks organizer's claimable share)
        event_config.organizer_fund_pool = event_config.organizer_fund_pool
            .checked_add(organizer_amount)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Update escrow balance
        event_escrow.balance = event_escrow.balance
            .checked_add(purchase_price)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_sub(owner_payout)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Update token state
        token_state.current_owner = new_owner;
        token_state.entry_price = purchase_price;
        token_state.current_price = purchase_price;

        emit!(TokenPurchased {
            event: event_key,
            token_id,
            previous_owner,
            new_owner,
            purchase_price,
            owner_payout,
            organizer_amount,
        });

        Ok(())
    }

    pub fn raise_price(ctx: Context<RaisePrice>, token_id: u64, new_price: u64) -> Result<()> {
        let event_config = &ctx.accounts.event_config;
        let token_state = &mut ctx.accounts.token_state;
        let event_escrow = &mut ctx.accounts.event_escrow;

        require!(new_price > token_state.current_price, DaddyXError::PriceTooLow);

        let price_diff = new_price
            .checked_sub(token_state.current_price)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Exploit-prevention discount formula:
        // cost = price_diff * (S - P) / (S - 1)
        // where S = step_factor_bps/10000, P = payout_factor_bps/10000
        let s_minus_p = event_config.step_factor_bps
            .checked_sub(event_config.payout_factor_bps)
            .ok_or(DaddyXError::ArithmeticOverflow)?;
        let s_minus_1 = event_config.step_factor_bps
            .checked_sub(10_000)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        let cost = price_diff
            .checked_mul(s_minus_p)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(s_minus_1)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Transfer cost from owner to escrow
        anchor_lang::system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: event_escrow.to_account_info(),
                },
            ),
            cost,
        )?;

        event_escrow.balance = event_escrow.balance
            .checked_add(cost)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        let old_price = token_state.current_price;
        token_state.current_price = new_price;

        emit!(PriceRaised {
            event: event_config.key(),
            token_id,
            old_price,
            new_price,
        });

        Ok(())
    }

    pub fn report_revenue(ctx: Context<ReportRevenue>, ticket_revenue: u64) -> Result<()> {
        let event_config = &mut ctx.accounts.event_config;
        let event_escrow = &mut ctx.accounts.event_escrow;

        require!(ctx.accounts.oracle.key() == event_config.oracle, DaddyXError::Unauthorized);
        require!(
            Clock::get()?.unix_timestamp >= event_config.end_date,
            DaddyXError::EventNotEnded
        );
        require!(!event_config.revenue_reported, DaddyXError::AlreadyReported);

        event_config.settled_revenue = ticket_revenue;
        event_config.revenue_reported = true;

        // Deposit fan revenue share pool into escrow so token claims can be paid out.
        // fan_pool = ticket_revenue × revenue_share_bps / 10000
        // Oracle (or sponsor) transfers this amount from their wallet to escrow.
        let fan_pool = ticket_revenue
            .checked_mul(event_config.revenue_share_bps)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        if fan_pool > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.oracle.to_account_info(),
                        to: event_escrow.to_account_info(),
                    },
                ),
                fan_pool,
            )?;
            event_escrow.balance = event_escrow.balance
                .checked_add(fan_pool)
                .ok_or(DaddyXError::ArithmeticOverflow)?;
        }

        // Auto-release milestone 3: remaining organizer_fund_pool → organizer
        if !event_config.milestone_3_released && event_config.organizer_fund_pool > 0 {
            let release_amount = event_config.organizer_fund_pool;
            event_config.organizer_fund_pool = 0;
            event_config.milestone_3_released = true;

            // Transfer from escrow to organizer
            **event_escrow.to_account_info().try_borrow_mut_lamports()? -= release_amount;
            **ctx.accounts.organizer.try_borrow_mut_lamports()? += release_amount;

            event_escrow.balance = event_escrow.balance
                .checked_sub(release_amount)
                .unwrap_or(0);

            emit!(MilestoneReleased {
                event: event_config.key(),
                milestone_index: 2,
                amount: release_amount,
                organizer: ctx.accounts.organizer.key(),
            });
        }

        emit!(RevenueReported {
            event: event_config.key(),
            revenue: ticket_revenue,
        });

        Ok(())
    }

    pub fn claim_revenue(ctx: Context<ClaimRevenue>, token_id: u64) -> Result<()> {
        let event_config = &ctx.accounts.event_config;
        let token_state = &mut ctx.accounts.token_state;
        let event_escrow = &mut ctx.accounts.event_escrow;

        require!(!token_state.revenue_claimed, DaddyXError::AlreadyClaimed);

        // payout = settled_revenue * revenue_share_bps / 10000 / token_count
        let payout = event_config.settled_revenue
            .checked_mul(event_config.revenue_share_bps)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(event_config.token_count)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        require!(event_escrow.balance >= payout, DaddyXError::InsufficientBalance);

        // Transfer payout from escrow to claimer
        **event_escrow.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.claimer.to_account_info().try_borrow_mut_lamports()? += payout;

        event_escrow.balance = event_escrow.balance
            .checked_sub(payout)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        token_state.revenue_claimed = true;

        emit!(RevenueClaimed {
            token_id,
            claimer: ctx.accounts.claimer.key(),
            amount: payout,
        });

        Ok(())
    }

    pub fn cancel_event(ctx: Context<CancelEvent>) -> Result<()> {
        let event_config = &mut ctx.accounts.event_config;
        let authority = ctx.accounts.authority.key();

        require!(
            authority == event_config.organizer,
            DaddyXError::Unauthorized
        );
        require!(!event_config.cancelled, DaddyXError::EventCancelled);

        event_config.cancelled = true;

        emit!(EventCancelled {
            event: ctx.accounts.event_config.key(),
        });

        Ok(())
    }

    pub fn claim_refund(ctx: Context<ClaimRefund>, token_id: u64) -> Result<()> {
        let token_state = &mut ctx.accounts.token_state;
        let event_escrow = &mut ctx.accounts.event_escrow;

        let refund_amount = token_state.current_price;
        require!(event_escrow.balance >= refund_amount, DaddyXError::InsufficientBalance);

        // Transfer refund from escrow to token holder
        **event_escrow.to_account_info().try_borrow_mut_lamports()? -= refund_amount;
        **ctx.accounts.claimer.to_account_info().try_borrow_mut_lamports()? += refund_amount;

        event_escrow.balance = event_escrow.balance
            .checked_sub(refund_amount)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        // Zero out the token price to prevent double refund
        token_state.current_price = 0;
        token_state.revenue_claimed = true; // reuse flag as "settled"

        Ok(())
    }

    // ── Milestone Release ─────────────────────────────────────

    pub fn request_milestone_release(
        ctx: Context<RequestMilestoneRelease>,
        milestone_index: u8,
    ) -> Result<()> {
        require!(milestone_index < 3, DaddyXError::InvalidMilestoneIndex);

        let event_config = &ctx.accounts.event_config;

        emit!(MilestoneRequested {
            event: event_config.key(),
            milestone_index,
            organizer: ctx.accounts.organizer.key(),
        });

        Ok(())
    }

    pub fn approve_milestone_release(
        ctx: Context<ApproveMilestoneRelease>,
        milestone_index: u8,
        release_bps: u64,
    ) -> Result<()> {
        require!(milestone_index < 3, DaddyXError::InvalidMilestoneIndex);

        let event_config = &mut ctx.accounts.event_config;
        let event_escrow = &mut ctx.accounts.event_escrow;

        match milestone_index {
            0 => require!(!event_config.milestone_1_released, DaddyXError::MilestoneAlreadyReleased),
            1 => require!(!event_config.milestone_2_released, DaddyXError::MilestoneAlreadyReleased),
            2 => require!(!event_config.milestone_3_released, DaddyXError::MilestoneAlreadyReleased),
            _ => return Err(DaddyXError::InvalidMilestoneIndex.into()),
        }

        let release_amount = event_config.organizer_fund_pool
            .checked_mul(release_bps)
            .ok_or(DaddyXError::ArithmeticOverflow)?
            .checked_div(10_000)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        require!(event_escrow.balance >= release_amount, DaddyXError::InsufficientBalance);

        // Transfer from escrow to organizer
        **event_escrow.to_account_info().try_borrow_mut_lamports()? -= release_amount;
        **ctx.accounts.organizer.try_borrow_mut_lamports()? += release_amount;

        event_escrow.balance = event_escrow.balance
            .checked_sub(release_amount)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        event_config.organizer_fund_pool = event_config.organizer_fund_pool
            .checked_sub(release_amount)
            .ok_or(DaddyXError::ArithmeticOverflow)?;

        match milestone_index {
            0 => event_config.milestone_1_released = true,
            1 => event_config.milestone_2_released = true,
            2 => event_config.milestone_3_released = true,
            _ => {}
        }

        emit!(MilestoneReleased {
            event: event_config.key(),
            milestone_index,
            amount: release_amount,
            organizer: ctx.accounts.organizer.key(),
        });

        Ok(())
    }
}
