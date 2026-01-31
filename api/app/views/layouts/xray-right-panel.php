<?php
$isShadowMode = isset($_SESSION['shadow_mode']) && $_SESSION['shadow_mode'];
?>

<!-- Right Panel -->
<aside class="right-panel">
    <!-- Search -->
    <div class="search-box">
        <i data-lucide="search" class="search-icon"></i>
        <input type="text" placeholder="search..." class="search-input" onclick="openSearchModal()">
    </div>

    <!-- Trending / Top Posts 24h -->
    <div class="panel-card">
        <div class="panel-card-header">
            <?php if ($isShadowMode): ?>
                <i data-lucide="flame" style="width: 16px; height: 16px; color: var(--primary);"></i>
                <h2 class="panel-card-title">top_posts_24h</h2>
            <?php else: ?>
                <h2 class="panel-card-title">Trending</h2>
            <?php endif; ?>
        </div>
        <div class="panel-card-body">
            <?php if ($isShadowMode): ?>
                <!-- Shadow mode: Top bidded posts -->
                <?php
                $topPosts = [
                    ['author' => 'anon_x7k2', 'preview' => 'insider alpha on upcoming...', 'bid' => '2.4 SOL', 'time' => '2h'],
                    ['author' => 'shadow_whale', 'preview' => 'market manipulation proof...', 'bid' => '1.8 SOL', 'time' => '5h'],
                    ['author' => 'dark_analyst', 'preview' => 'leaked tokenomics for...', 'bid' => '1.2 SOL', 'time' => '8h'],
                    ['author' => 'cipher_0x', 'preview' => 'exclusive airdrop strategy...', 'bid' => '0.9 SOL', 'time' => '12h'],
                    ['author' => 'ghost_dev', 'preview' => 'smart contract vulnerability...', 'bid' => '0.7 SOL', 'time' => '18h'],
                ];
                foreach ($topPosts as $post): ?>
                    <a href="#" class="panel-card-item top-post-item">
                        <div class="top-post-info">
                            <p class="top-post-author"><?= htmlspecialchars($post['author']) ?></p>
                            <p class="top-post-preview"><?= htmlspecialchars($post['preview']) ?></p>
                        </div>
                        <div class="top-post-meta">
                            <p class="top-post-bid"><?= htmlspecialchars($post['bid']) ?></p>
                            <p class="top-post-time"><?= htmlspecialchars($post['time']) ?></p>
                        </div>
                    </a>
                <?php endforeach; ?>
            <?php else: ?>
                <!-- Public mode: Trending topics -->
                <?php
                $trending = [
                    ['tag' => 'Solana', 'posts' => '12.4K'],
                    ['tag' => 'DeFi', 'posts' => '8.2K'],
                    ['tag' => 'NFTs', 'posts' => '5.7K'],
                    ['tag' => 'Airdrop', 'posts' => '4.1K'],
                    ['tag' => 'Web3', 'posts' => '3.8K'],
                ];
                foreach ($trending as $topic): ?>
                    <a href="#" class="panel-card-item trending-item">
                        <div class="trending-info">
                            <p class="trending-tag">#<?= htmlspecialchars($topic['tag']) ?></p>
                            <p class="trending-posts"><?= htmlspecialchars($topic['posts']) ?> posts</p>
                        </div>
                        <i data-lucide="trending-up" style="width: 16px; height: 16px; color: var(--muted-foreground);"></i>
                    </a>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>

    <?php if ($isShadowMode): ?>
        <!-- NDD Marketplace -->
        <div class="panel-card">
            <div class="panel-card-header">
                <i data-lucide="globe" style="width: 16px; height: 16px; color: var(--primary);"></i>
                <h2 class="panel-card-title">premium_ndd</h2>
            </div>
            <div class="panel-card-body">
                <?php
                $marketplace = [
                    ['domain' => 'defi.anon', 'price' => '45 SOL'],
                    ['domain' => 'alpha.anon', 'price' => '32 SOL'],
                    ['domain' => 'whale.anon', 'price' => '28 SOL'],
                    ['domain' => 'crypto.anon', 'price' => '120 SOL'],
                ];
                foreach ($marketplace as $item): ?>
                    <div class="panel-card-item ndd-item">
                        <div class="ndd-info">
                            <img src="https://api.dicebear.com/7.x/shapes/svg?seed=<?= explode('.', $item['domain'])[0] ?>&backgroundColor=ec4899,a855f7,8b5cf6" alt="<?= htmlspecialchars($item['domain']) ?>" class="ndd-avatar">
                            <div class="ndd-details">
                                <p class="ndd-domain"><?= htmlspecialchars($item['domain']) ?></p>
                                <p class="ndd-price"><?= htmlspecialchars($item['price']) ?></p>
                            </div>
                        </div>
                        <button class="ndd-buy-btn">buy</button>
                    </div>
                <?php endforeach; ?>
            </div>
            <a href="#" class="panel-card-footer">view_all_domains</a>
        </div>
    <?php else: ?>
        <!-- Suggested Users -->
        <div class="panel-card">
            <div class="panel-card-header">
                <h2 class="panel-card-title">Who to follow</h2>
            </div>
            <div class="panel-card-body">
                <?php
                // Get suggested users from database
                require_once __DIR__ . '/../../models/User.php';
                $userModel = new User();
                $suggestedUsers = $userModel->getSuggestedUsers(AuthController::getCurrentUserId(), 4);

                if (empty($suggestedUsers)) {
                    // Fallback to static data if no users found
                    $suggestedUsers = [
                        ['id' => 0, 'username' => 'solana_dev', 'bio' => 'Building the future of finance'],
                        ['id' => 0, 'username' => 'crypto_whale', 'bio' => 'On-chain analyst'],
                        ['id' => 0, 'username' => 'defi_queen', 'bio' => 'Yield farming expert'],
                        ['id' => 0, 'username' => 'nft_collector', 'bio' => 'Digital art enthusiast'],
                    ];
                }

                foreach ($suggestedUsers as $user): ?>
                    <div class="panel-card-item suggested-user-item">
                        <img
                            src="https://api.dicebear.com/7.x/avataaars/svg?seed=<?= htmlspecialchars($user['username']) ?>"
                            alt="<?= htmlspecialchars($user['username']) ?>"
                            class="suggested-user-avatar"
                        >
                        <div class="suggested-user-info">
                            <p class="suggested-user-name"><?= htmlspecialchars($user['username']) ?></p>
                            <p class="suggested-user-bio"><?= htmlspecialchars($user['bio'] ?? '') ?></p>
                        </div>
                        <?php if (isset($user['id']) && $user['id'] > 0): ?>
                            <button class="follow-btn" onclick="toggleFollow(<?= $user['id'] ?>, this)">follow</button>
                        <?php else: ?>
                            <button class="follow-btn">follow</button>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
            </div>
            <a href="#" class="panel-card-footer">show more</a>
        </div>
    <?php endif; ?>

    <!-- Footer -->
    <div class="panel-footer">
        <div class="panel-footer-links">
            <a href="#">terms</a>
            <span>·</span>
            <a href="#">privacy</a>
            <span>·</span>
            <a href="#">about</a>
            <span>·</span>
            <a href="#">docs</a>
        </div>
        <p class="panel-footer-copyright">© 2026 X-RAY</p>
    </div>
</aside>
