<?php
require_once __DIR__ . '/../../controllers/AuthController.php';
$isLoggedIn = AuthController::isLoggedIn();
$wallet = $isLoggedIn ? AuthController::getCurrentWallet() : null;
$currentUser = $isLoggedIn ? AuthController::getCurrentUser() : null;
$isShadowMode = isset($_SESSION['shadow_mode']) && $_SESSION['shadow_mode'];
?>

<!-- Left Sidebar -->
<aside class="left-sidebar">
    <!-- Logo -->
    <div class="sidebar-logo">
        <div class="logo-container">
            <div class="logo-box">
                <img src="public/images/<?= $isShadowMode ? 'private-logo.png' : 'public-logo.png' ?>" alt="X-RAY">
            </div>
            <span class="logo-text">X-RAY</span>
        </div>
    </div>

    <!-- Mode Toggle -->
    <div class="mode-toggle-container">
        <button onclick="toggleShadowMode()" class="mode-toggle">
            <!-- Sun icon -->
            <div class="mode-icon sun <?= !$isShadowMode ? 'active' : '' ?>">
                <i data-lucide="sun" style="width: 16px; height: 16px;"></i>
            </div>

            <!-- Moon icon -->
            <div class="mode-icon moon <?= $isShadowMode ? 'active' : '' ?>">
                <i data-lucide="moon" style="width: 16px; height: 16px;"></i>
            </div>
        </button>

        <p class="mode-toggle-label">
            <?= $isShadowMode ? '// encrypted' : '// wallet visible' ?>
        </p>
    </div>

    <!-- Navigation -->
    <nav class="sidebar-nav">
        <ul>
            <li>
                <a href="index.php" class="<?= (!isset($_GET['action']) || $_GET['action'] === 'index') ? 'active' : '' ?>">
                    <i data-lucide="home" style="width: 20px; height: 20px;"></i>
                    <span>home</span>
                </a>
            </li>
            <li>
                <button onclick="openSearchModal()" class="nav-button">
                    <i data-lucide="search" style="width: 20px; height: 20px;"></i>
                    <span>explore</span>
                </button>
            </li>
            <li>
                <a href="index.php?action=profile" class="<?= (isset($_GET['action']) && $_GET['action'] === 'profile') ? 'active' : '' ?>">
                    <i data-lucide="user" style="width: 20px; height: 20px;"></i>
                    <span>profile</span>
                </a>
            </li>
            <li>
                <a href="index.php?action=notifications" class="<?= (isset($_GET['action']) && $_GET['action'] === 'notifications') ? 'active' : '' ?>">
                    <i data-lucide="bell" style="width: 20px; height: 20px;"></i>
                    <span>notifications</span>
                </a>
            </li>
            <li>
                <div class="nav-item-coming-soon" onmouseenter="flipText(this, true)" onmouseleave="flipText(this, false)">
                    <i data-lucide="mail" style="width: 20px; height: 20px;"></i>
                    <span class="flip-text-container">
                        <span class="flip-text-front">messages</span>
                        <span class="flip-text-back">coming soon</span>
                    </span>
                </div>
            </li>
        </ul>
    </nav>

    <!-- How it works -->
    <a href="index.php?action=how-it-works" class="how-it-works-link">
        <i data-lucide="help-circle" style="width: 20px; height: 20px;"></i>
        <span>how it works</span>
    </a>

    <!-- Post Button -->
    <button onclick="openPostModal()" class="post-button">
        <i data-lucide="pen-square" style="width: 16px; height: 16px;"></i>
        <span><?= $isShadowMode ? 'shadow post' : 'post' ?></span>
    </button>

    <!-- Wallet Section -->
    <div class="wallet-section">
        <?php if ($isLoggedIn): ?>
            <div class="wallet-connected">
                <div class="wallet-info">
                    <div class="wallet-avatar">
                        <i data-lucide="wallet" style="width: 16px; height: 16px;"></i>
                    </div>
                    <div class="wallet-details">
                        <p class="wallet-name">
                            <?php if ($currentUser && isset($currentUser['username'])): ?>
                                <?= htmlspecialchars($currentUser['username']) ?>
                            <?php else: ?>
                                <?= $isShadowMode ? 'anon_' . substr(md5($wallet), 0, 4) : substr($wallet, 0, 4) . '...' . substr($wallet, -4) ?>
                            <?php endif; ?>
                        </p>
                        <p class="wallet-address" id="wallet-balance-sidebar">
                            <script>
                                // Display cached balance immediately if available
                                const cachedBalance = sessionStorage.getItem('wallet_balance');
                                if (cachedBalance) {
                                    document.getElementById('wallet-balance-sidebar').textContent = parseFloat(cachedBalance).toFixed(3) + ' SOL';
                                } else {
                                    document.getElementById('wallet-balance-sidebar').textContent = '--- SOL';
                                }
                            </script>
                        </p>
                    </div>
                </div>
                <button onclick="window.location='index.php?action=logout'" class="logout-btn">
                    <i data-lucide="log-out" style="width: 16px; height: 16px;"></i>
                </button>
            </div>
        <?php else: ?>
            <button id="connectPhantomBtn" onclick="connectPhantom()" class="wallet-connect-btn">
                <i data-lucide="wallet" style="width: 16px; height: 16px;"></i>
                <span>connect_wallet</span>
            </button>
        <?php endif; ?>
    </div>
</aside>

<!-- Search Modal -->
<div id="searchModal" class="search-modal-backdrop" style="display: none;">
    <div class="search-modal-container">
        <div class="search-modal-content">
            <!-- Search input -->
            <div class="search-modal-input-container">
                <i data-lucide="search" style="width: 20px; height: 20px; color: var(--muted-foreground);"></i>
                <input
                    type="text"
                    id="searchModalInput"
                    placeholder="search users..."
                    class="search-modal-input"
                    oninput="handleSearchInput(this.value)"
                >
                <button onclick="closeSearchModal()" class="search-modal-close">
                    <i data-lucide="x" style="width: 20px; height: 20px;"></i>
                </button>
            </div>

            <!-- Results -->
            <div id="searchResults" class="search-modal-results">
                <div class="search-modal-empty">
                    <p>search for users</p>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
// Search Modal Functions
function openSearchModal() {
    document.getElementById('searchModal').style.display = 'flex';
    setTimeout(() => {
        document.getElementById('searchModalInput').focus();
    }, 10);
    document.body.style.overflow = 'hidden';
}

function closeSearchModal() {
    document.getElementById('searchModal').style.display = 'none';
    document.getElementById('searchModalInput').value = '';
    document.getElementById('searchResults').innerHTML = '<div class="search-modal-empty"><p>search for users</p></div>';
    document.body.style.overflow = '';
}

// Close on escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('searchModal').style.display === 'flex') {
        closeSearchModal();
    }
});

// Close on backdrop click
document.getElementById('searchModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeSearchModal();
    }
});

// Handle search
async function handleSearchInput(query) {
    const resultsContainer = document.getElementById('searchResults');

    if (query.length === 0) {
        resultsContainer.innerHTML = '<div class="search-modal-empty"><p>search for users</p></div>';
        return;
    }

    try {
        const response = await fetch('index.php?action=searchUsers&q=' + encodeURIComponent(query));
        const data = await response.json();

        if (data.success && data.users.length > 0) {
            resultsContainer.innerHTML = data.users.map(user => `
                <a href="index.php?action=user&username=${encodeURIComponent(user.username)}" class="search-result-item" onclick="closeSearchModal()">
                    <img src="${user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + user.username}" alt="${user.username}" class="search-result-avatar">
                    <div class="search-result-info">
                        <p class="search-result-name">${user.username}</p>
                        <p class="search-result-bio">${user.bio || ''}</p>
                    </div>
                    <p class="search-result-handle">@${user.username}</p>
                </a>
            `).join('');
        } else {
            resultsContainer.innerHTML = '<div class="search-modal-empty"><p>no users found</p></div>';
        }
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<div class="search-modal-empty"><p>no users found</p></div>';
    }
}

// Flip text animation for coming soon items
function flipText(element, isHover) {
    const container = element.querySelector('.flip-text-container');
    if (container) {
        if (isHover) {
            container.classList.add('flipped');
        } else {
            container.classList.remove('flipped');
        }
    }
}
</script>
