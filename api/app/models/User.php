<?php
require_once __DIR__ . '/../../config/database.php';

class User {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Génère une clé secrète aléatoire sécurisée
     */
    public static function generateSecretKey() {
        // Génère une clé de 64 caractères alphanumériques + symboles
        $characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}';
        $key = '';
        $length = 64;

        for ($i = 0; $i < $length; $i++) {
            $key .= $characters[random_int(0, strlen($characters) - 1)];
        }

        return $key;
    }

    /**
     * Hash une clé secrète avec bcrypt (inclut automatiquement le salt)
     */
    private function hashSecretKey($secretKey) {
        return password_hash($secretKey, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /**
     * Crée un nouveau compte anonyme
     * Retourne la clé secrète en clair (à montrer une seule fois à l'utilisateur)
     */
    public function createUser() {
        $secretKey = self::generateSecretKey();
        $hashedKey = $this->hashSecretKey($secretKey);

        $stmt = $this->db->prepare("
            INSERT INTO users (secret_key_hash, created_at)
            VALUES (:hash, NOW())
        ");

        $stmt->bindParam(':hash', $hashedKey);

        if ($stmt->execute()) {
            return [
                'success' => true,
                'user_id' => $this->db->lastInsertId(),
                'secret_key' => $secretKey
            ];
        }

        return ['success' => false];
    }

    /**
     * Authentifie un utilisateur avec sa clé secrète
     */
    public function authenticate($secretKey) {
        $stmt = $this->db->prepare("
            SELECT id, secret_key_hash
            FROM users
        ");

        $stmt->execute();
        $users = $stmt->fetchAll();

        // Vérifier la clé contre tous les hash (car bcrypt inclut le salt)
        foreach ($users as $user) {
            if (password_verify($secretKey, $user['secret_key_hash'])) {
                // Mettre à jour last_login
                $updateStmt = $this->db->prepare("
                    UPDATE users
                    SET last_login = NOW()
                    WHERE id = :id
                ");
                $updateStmt->bindParam(':id', $user['id']);
                $updateStmt->execute();

                return [
                    'success' => true,
                    'user_id' => $user['id']
                ];
            }
        }

        return ['success' => false];
    }

    /**
     * Récupère les informations d'un utilisateur
     */
    public function getUserById($userId) {
        $stmt = $this->db->prepare("
            SELECT id, created_at, last_login
            FROM users
            WHERE id = :id
        ");

        $stmt->bindParam(':id', $userId);
        $stmt->execute();

        return $stmt->fetch();
    }

    /**
     * Compte le nombre de posts d'un utilisateur
     */
    public function getUserPostCount($userId) {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as count
            FROM posts
            WHERE user_id = :user_id
        ");

        $stmt->bindParam(':user_id', $userId);
        $stmt->execute();

        $result = $stmt->fetch();
        return $result['count'] ?? 0;
    }

    /**
     * Crée ou récupère un utilisateur par adresse de wallet Solana (Phantom)
     */
    public function findOrCreateByWallet($walletAddress) {
        // Chercher si l'utilisateur existe
        $stmt = $this->db->prepare("
            SELECT id, wallet_address, created_at, last_login
            FROM users
            WHERE wallet_address = :wallet
        ");

        $stmt->bindParam(':wallet', $walletAddress);
        $stmt->execute();
        $user = $stmt->fetch();

        if ($user) {
            // Mettre à jour last_login
            $updateStmt = $this->db->prepare("
                UPDATE users
                SET last_login = NOW()
                WHERE id = :id
            ");
            $updateStmt->bindParam(':id', $user['id']);
            $updateStmt->execute();

            return [
                'success' => true,
                'user_id' => $user['id'],
                'wallet_address' => $user['wallet_address'],
                'is_new' => false
            ];
        }

        // Créer un nouvel utilisateur
        $insertStmt = $this->db->prepare("
            INSERT INTO users (wallet_address, created_at)
            VALUES (:wallet, NOW())
        ");

        $insertStmt->bindParam(':wallet', $walletAddress);

        if ($insertStmt->execute()) {
            return [
                'success' => true,
                'user_id' => $this->db->lastInsertId(),
                'wallet_address' => $walletAddress,
                'is_new' => true
            ];
        }

        return ['success' => false];
    }

    /**
     * Récupère un utilisateur par adresse de wallet
     */
    public function getUserByWallet($walletAddress) {
        $stmt = $this->db->prepare("
            SELECT id, wallet_address, username, profile_picture, created_at, last_login
            FROM users
            WHERE wallet_address = :wallet
        ");

        $stmt->bindParam(':wallet', $walletAddress);
        $stmt->execute();

        return $stmt->fetch();
    }

    /**
     * Récupère un utilisateur par ID
     */
    public function findById($userId) {
        $stmt = $this->db->prepare("
            SELECT id, wallet_address, username, profile_picture, bio, location, website, banner_picture, created_at, last_login
            FROM users
            WHERE id = :id
        ");

        $stmt->bindParam(':id', $userId);
        $stmt->execute();

        return $stmt->fetch();
    }

    /**
     * Récupère un utilisateur par username
     */
    public function findByUsername($username) {
        $stmt = $this->db->prepare("
            SELECT id, wallet_address, username, profile_picture, bio, location, website, banner_picture, created_at, last_login
            FROM users
            WHERE username = :username
        ");

        $stmt->bindParam(':username', $username);
        $stmt->execute();

        return $stmt->fetch();
    }

    /**
     * Met à jour le profil utilisateur (username et photo)
     */
    public function updateProfile($userId, $username, $profilePicture = null) {
        if ($profilePicture === null || empty($profilePicture)) {
            $stmt = $this->db->prepare("
                UPDATE users
                SET username = :username
                WHERE id = :id
            ");
            $stmt->bindParam(':username', $username);
            $stmt->bindParam(':id', $userId);
        } else {
            $stmt = $this->db->prepare("
                UPDATE users
                SET username = :username, profile_picture = :profile_picture
                WHERE id = :id
            ");
            $stmt->bindParam(':username', $username);
            $stmt->bindParam(':profile_picture', $profilePicture);
            $stmt->bindParam(':id', $userId);
        }

        return $stmt->execute();
    }

    /**
     * Met à jour le profil complet (tous les champs)
     */
    public function updateFullProfile($userId, $data) {
        // Get current user data
        $currentUser = $this->findById($userId);

        // Build dynamic query
        $fields = ['username = :username'];
        $params = [':username' => $data['username'], ':id' => $userId];

        // Bio
        if (isset($data['bio'])) {
            $fields[] = 'bio = :bio';
            $params[':bio'] = $data['bio'];
        }

        // Location
        if (isset($data['location'])) {
            $fields[] = 'location = :location';
            $params[':location'] = $data['location'];
        }

        // Website
        if (isset($data['website'])) {
            $fields[] = 'website = :website';
            $params[':website'] = $data['website'];
        }

        // Profile picture (only update if new one uploaded)
        if (!empty($data['profile_picture'])) {
            $fields[] = 'profile_picture = :profile_picture';
            $params[':profile_picture'] = $data['profile_picture'];
        }

        // Banner picture (only update if new one uploaded)
        if (!empty($data['banner_picture'])) {
            $fields[] = 'banner_picture = :banner_picture';
            $params[':banner_picture'] = $data['banner_picture'];
        }

        $sql = "UPDATE users SET " . implode(', ', $fields) . " WHERE id = :id";
        $stmt = $this->db->prepare($sql);

        foreach ($params as $key => $value) {
            $stmt->bindValue($key, $value);
        }

        return $stmt->execute();
    }

    /**
     * Follow a user
     */
    public function follow($followerId, $followingId) {
        // Cannot follow yourself
        if ($followerId == $followingId) {
            return false;
        }

        $stmt = $this->db->prepare("
            INSERT IGNORE INTO follows (follower_id, following_id)
            VALUES (:follower_id, :following_id)
        ");

        $stmt->bindParam(':follower_id', $followerId, PDO::PARAM_INT);
        $stmt->bindParam(':following_id', $followingId, PDO::PARAM_INT);

        return $stmt->execute();
    }

    /**
     * Unfollow a user
     */
    public function unfollow($followerId, $followingId) {
        $stmt = $this->db->prepare("
            DELETE FROM follows
            WHERE follower_id = :follower_id AND following_id = :following_id
        ");

        $stmt->bindParam(':follower_id', $followerId, PDO::PARAM_INT);
        $stmt->bindParam(':following_id', $followingId, PDO::PARAM_INT);

        return $stmt->execute();
    }

    /**
     * Check if user A follows user B
     */
    public function isFollowing($followerId, $followingId) {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as count
            FROM follows
            WHERE follower_id = :follower_id AND following_id = :following_id
        ");

        $stmt->bindParam(':follower_id', $followerId, PDO::PARAM_INT);
        $stmt->bindParam(':following_id', $followingId, PDO::PARAM_INT);
        $stmt->execute();

        $result = $stmt->fetch();
        return $result['count'] > 0;
    }

    /**
     * Get followers count for a user
     */
    public function getFollowersCount($userId) {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as count
            FROM follows
            WHERE following_id = :user_id
        ");

        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->execute();

        $result = $stmt->fetch();
        return $result['count'] ?? 0;
    }

    /**
     * Get following count for a user
     */
    public function getFollowingCount($userId) {
        $stmt = $this->db->prepare("
            SELECT COUNT(*) as count
            FROM follows
            WHERE follower_id = :user_id
        ");

        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->execute();

        $result = $stmt->fetch();
        return $result['count'] ?? 0;
    }

    /**
     * Get list of users that a user follows
     */
    public function getFollowing($userId, $limit = 50) {
        $stmt = $this->db->prepare("
            SELECT u.id, u.wallet_address, u.username, u.profile_picture, u.bio, f.created_at as followed_at
            FROM follows f
            JOIN users u ON f.following_id = u.id
            WHERE f.follower_id = :user_id
            ORDER BY f.created_at DESC
            LIMIT :limit
        ");

        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Get list of users that follow a user
     */
    public function getFollowers($userId, $limit = 50) {
        $stmt = $this->db->prepare("
            SELECT u.id, u.wallet_address, u.username, u.profile_picture, u.bio, f.created_at as followed_at
            FROM follows f
            JOIN users u ON f.follower_id = u.id
            WHERE f.following_id = :user_id
            ORDER BY f.created_at DESC
            LIMIT :limit
        ");

        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Get IDs of users that a user follows
     */
    public function getFollowingIds($userId) {
        $stmt = $this->db->prepare("
            SELECT following_id
            FROM follows
            WHERE follower_id = :user_id
        ");

        $stmt->bindParam(':user_id', $userId, PDO::PARAM_INT);
        $stmt->execute();

        return array_column($stmt->fetchAll(), 'following_id');
    }

    /**
     * Get suggested users to follow (excludes current user and already followed users)
     */
    public function getSuggestedUsers($currentUserId = null, $limit = 4) {
        if ($currentUserId) {
            $stmt = $this->db->prepare("
                SELECT u.id, u.username, u.profile_picture, u.bio
                FROM users u
                WHERE u.id != :current_user_id
                AND u.username IS NOT NULL
                AND u.profile_picture IS NOT NULL
                AND u.id NOT IN (
                    SELECT following_id FROM follows WHERE follower_id = :current_user_id2
                )
                ORDER BY RAND()
                LIMIT :limit
            ");

            $stmt->bindParam(':current_user_id', $currentUserId, PDO::PARAM_INT);
            $stmt->bindParam(':current_user_id2', $currentUserId, PDO::PARAM_INT);
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        } else {
            $stmt = $this->db->prepare("
                SELECT u.id, u.username, u.profile_picture, u.bio
                FROM users u
                WHERE u.username IS NOT NULL
                AND u.profile_picture IS NOT NULL
                ORDER BY RAND()
                LIMIT :limit
            ");

            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        }

        $stmt->execute();
        return $stmt->fetchAll();
    }

    /**
     * Search users by username
     */
    public function searchUsers($query, $limit = 10) {
        $searchTerm = '%' . $query . '%';

        $stmt = $this->db->prepare("
            SELECT id, username, profile_picture, bio, wallet_address
            FROM users
            WHERE username IS NOT NULL
            AND (username LIKE :query OR bio LIKE :query2)
            ORDER BY
                CASE WHEN username LIKE :exact THEN 0 ELSE 1 END,
                username ASC
            LIMIT :limit
        ");

        $stmt->bindParam(':query', $searchTerm);
        $stmt->bindParam(':query2', $searchTerm);
        $stmt->bindValue(':exact', $query . '%');
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
