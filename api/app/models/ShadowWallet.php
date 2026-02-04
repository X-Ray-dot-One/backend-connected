<?php
require_once __DIR__ . '/../../config/database.php';

class ShadowWallet {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Get wallet count for a user (by hashed userId)
     */
    public function getWalletCount($userId) {
        $stmt = $this->db->prepare("
            SELECT count FROM wallet_counts WHERE user_id = :user_id
        ");
        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();
        $result = $stmt->fetch();

        return $result ? (int)$result['count'] : 0;
    }

    /**
     * Check if a wallet address is premium and get profile picture
     * Returns array with is_premium (bool) and profile_picture (string|null)
     */
    public function isPremium($walletAddress) {
        $stmt = $this->db->prepare("
            SELECT is_premium, profile_picture FROM premium_wallets WHERE wallet_address = :wallet_address
        ");
        $stmt->bindParam(':wallet_address', $walletAddress);
        $stmt->execute();
        $result = $stmt->fetch();

        return [
            'is_premium' => $result ? (bool)$result['is_premium'] : false,
            'profile_picture' => $result ? $result['profile_picture'] : null
        ];
    }

    /**
     * Set premium status for a wallet address
     */
    public function setPremium($walletAddress, $isPremium = true) {
        if ($isPremium) {
            $stmt = $this->db->prepare("
                INSERT INTO premium_wallets (wallet_address, is_premium)
                VALUES (:wallet_address, 1)
                ON DUPLICATE KEY UPDATE is_premium = 1
            ");
        } else {
            $stmt = $this->db->prepare("
                DELETE FROM premium_wallets WHERE wallet_address = :wallet_address
            ");
        }
        $stmt->bindParam(':wallet_address', $walletAddress);

        return $stmt->execute();
    }

    /**
     * Set profile picture for a premium wallet
     */
    public function setPremiumProfilePicture($walletAddress, $profilePicture) {
        $stmt = $this->db->prepare("
            UPDATE premium_wallets SET profile_picture = :profile_picture WHERE wallet_address = :wallet_address
        ");
        $stmt->bindParam(':profile_picture', $profilePicture);
        $stmt->bindParam(':wallet_address', $walletAddress);

        return $stmt->execute();
    }

    /**
     * Increment wallet count for a user
     * Creates the record if it doesn't exist
     */
    public function incrementWalletCount($userId) {
        // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic operation
        $stmt = $this->db->prepare("
            INSERT INTO wallet_counts (user_id, count)
            VALUES (:user_id, 1)
            ON DUPLICATE KEY UPDATE count = count + 1
        ");
        $stmt->bindParam(':user_id', $userId);
        $success = $stmt->execute();

        if ($success) {
            return $this->getWalletCount($userId);
        }
        return false;
    }

    /**
     * Register a new shadow wallet with its name
     */
    public function createShadowWallet($shadowPubkey, $name) {
        $stmt = $this->db->prepare("
            INSERT INTO shadow_wallets (shadow_pubkey, name)
            VALUES (:shadow_pubkey, :name)
        ");
        $stmt->bindParam(':shadow_pubkey', $shadowPubkey);
        $stmt->bindParam(':name', $name);

        return $stmt->execute();
    }

    /**
     * Check if a name already exists
     */
    public function nameExists($name) {
        $stmt = $this->db->prepare("
            SELECT 1 FROM shadow_wallets WHERE name = :name LIMIT 1
        ");
        $stmt->bindParam(':name', $name);
        $stmt->execute();

        return $stmt->fetch() !== false;
    }

    /**
     * Get the name of a shadow wallet by its public key
     */
    public function getNameByPubkey($shadowPubkey) {
        $stmt = $this->db->prepare("
            SELECT name FROM shadow_wallets WHERE shadow_pubkey = :shadow_pubkey
        ");
        $stmt->bindParam(':shadow_pubkey', $shadowPubkey);
        $stmt->execute();
        $result = $stmt->fetch();

        return $result ? $result['name'] : null;
    }

    /**
     * Get a shadow wallet by its public key
     */
    public function getByPubkey($shadowPubkey) {
        $stmt = $this->db->prepare("
            SELECT * FROM shadow_wallets WHERE shadow_pubkey = :shadow_pubkey
        ");
        $stmt->bindParam(':shadow_pubkey', $shadowPubkey);
        $stmt->execute();

        return $stmt->fetch();
    }

    /**
     * Get a shadow wallet by its name
     * Returns pubkey and created_at
     */
    public function getByName($name) {
        $stmt = $this->db->prepare("
            SELECT shadow_pubkey, name, created_at
            FROM shadow_wallets
            WHERE name = :name
            LIMIT 1
        ");
        $stmt->bindParam(':name', $name);
        $stmt->execute();

        return $stmt->fetch() ?: null;
    }

    /**
     * Get all shadow wallets for debugging/admin
     */
    public function getAllShadowWallets($limit = 100) {
        $stmt = $this->db->prepare("
            SELECT shadow_pubkey, name, created_at
            FROM shadow_wallets
            ORDER BY created_at DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Search shadow wallets by name
     */
    public function searchByName($query, $limit = 20) {
        $searchPattern = '%' . $query . '%';
        $stmt = $this->db->prepare("
            SELECT shadow_pubkey, name, created_at
            FROM shadow_wallets
            WHERE name LIKE :query
            ORDER BY
                CASE WHEN name LIKE :exact THEN 0 ELSE 1 END,
                name ASC
            LIMIT :limit
        ");
        $stmt->bindValue(':query', $searchPattern);
        $stmt->bindValue(':exact', $query . '%');
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Update the name of a shadow wallet (used for NDD purchase)
     */
    public function updateName($shadowPubkey, $newName) {
        $stmt = $this->db->prepare("
            UPDATE shadow_wallets
            SET name = :new_name
            WHERE shadow_pubkey = :shadow_pubkey
        ");
        $stmt->bindParam(':new_name', $newName);
        $stmt->bindParam(':shadow_pubkey', $shadowPubkey);

        return $stmt->execute();
    }

    /**
     * Get batch info (name + premium status) for multiple wallets
     * Returns associative array: wallet_address => { name, is_premium, profile_picture }
     */
    public function getBatchInfo(array $wallets) {
        if (empty($wallets)) {
            return [];
        }

        $results = [];

        // Initialize all wallets with default values
        foreach ($wallets as $wallet) {
            $results[$wallet] = [
                'name' => null,
                'is_premium' => false,
                'profile_picture' => null
            ];
        }

        // Build placeholders for IN clause
        $placeholders = implode(',', array_fill(0, count($wallets), '?'));

        // Get names from shadow_wallets
        $stmt = $this->db->prepare("
            SELECT shadow_pubkey, name
            FROM shadow_wallets
            WHERE shadow_pubkey IN ($placeholders)
        ");
        $stmt->execute($wallets);
        $nameResults = $stmt->fetchAll();

        foreach ($nameResults as $row) {
            if (isset($results[$row['shadow_pubkey']])) {
                $results[$row['shadow_pubkey']]['name'] = $row['name'];
            }
        }

        // Get premium status from premium_wallets
        $stmt = $this->db->prepare("
            SELECT wallet_address, is_premium, profile_picture
            FROM premium_wallets
            WHERE wallet_address IN ($placeholders)
        ");
        $stmt->execute($wallets);
        $premiumResults = $stmt->fetchAll();

        foreach ($premiumResults as $row) {
            if (isset($results[$row['wallet_address']])) {
                $results[$row['wallet_address']]['is_premium'] = (bool)$row['is_premium'];
                $results[$row['wallet_address']]['profile_picture'] = $row['profile_picture'];
            }
        }

        return $results;
    }
}
