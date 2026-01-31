# X-RAY — Product Script (~3:30)

---

Every day, millions of people self-censor online. They hold back opinions, avoid controversial takes, and filter themselves — because their name, their face, their reputation is attached to every word.

What if you didn't have to choose between speaking freely and protecting your identity?

**This is X-RAY.**

X-RAY is a social platform built on Solana with two modes: Public and Shadow.

In **Public Mode**, it works like any social platform. You connect your wallet, set up a profile, post, follow people, like, comment — the usual. Your identity is tied to your wallet address.

But flip the switch, and you enter **Shadow Mode**.

In Shadow Mode, you don't post as yourself. You post through **shadow wallets** — anonymous identities derived from a one-way cryptographic signature. You can generate as many shadow identities as you want, for free, instantly. Nobody — not even us — can trace a shadow wallet back to your real wallet. The math makes it impossible.

And to make the funding itself untraceable, we integrated **Privacy Cash** — so when you fund your shadow wallets, the link between your public wallet and your shadow identity is completely broken on-chain.

Here's what's important to understand: our architecture is **zero-knowledge**. **We store nothing**. No posts, no messages, no content on our servers. Everything in Shadow Mode lives entirely on the Solana blockchain. Your posts are on-chain. Your DMs are on-chain. The frontend reads directly from the blockchain. If our servers go down tomorrow, your data is still there — permanent, censorship-resistant, and owned by no on`e` but the chain itself. We have no database to leak, no content to moderate, no kill switch.

Now, how does posting work? In Shadow Mode, every post is **targeted**. You pick a target — a person, a project, a topic — and you write your take. Every post requires a **SOL bid**. The higher your bid, the higher your post ranks on that target's page. This isn't just a spam filter — it's a **proof of conviction**. If you believe in what you're saying, you put money behind it. The best takes rise to the top, not because of followers or algorithms, but because someone was willing to stake real value on their words.

For those who want a persistent anonymous identity. You can purchase a premium identity on our marketplace. This gives your shadow wallet a recognizable name, a custom profile picture, badge, and way more. You're still anonymous — but you're building reputation under a pseudonym. And you can always generate more free identities alongside your premium ones.

Now, the feature I'm most excited about — **private messaging with Arcium**.

We integrated Arcium's MPC encryption to build fully encrypted DMs between shadow wallets. Not only is the message content encrypted end-to-end with X25519 — but the **sender and recipient identities are also encrypted on-chain** using Arcium's multi-party computation. Even if someone reads every transaction on Solana, they cannot see who is talking to whom. The metadata itself is private. And again — none of this touches our servers. It's all on-chain, all encrypted, all frontend.

Let me recap:
- **Shadow wallets**: unlimited free identities, one-way derivation, untraceable
- **Privacy Cash**: breaks the funding link between public and shadow wallets
- **On-chain posts**: targeted, bid-ranked, atomic — no backend, no database
- **Private messages**: double encryption with Arcium MPC — fully on-chain
- **Zero server storage**: no posts, no messages, no content on our end — ever

X-RAY isn't trying to replace Twitter. It's building something that never existed — a platform where your words carry weight because you put value behind them, and where privacy isn't a feature, it's the architecture itself.

We're live on devnet right now. Come try it.
