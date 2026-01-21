<?php
require_once __DIR__ . '/../../config/database.php';

class PremiumNdd {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    /**
     * Get all premium NDD listings
     */
    public function getAll($limit = 20) {
        $stmt = $this->db->prepare("
            SELECT name, pfp, cost
            FROM premium_ndd
            ORDER BY cost DESC
            LIMIT :limit
        ");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    /**
     * Create a new premium NDD listing
     */
    public function create($name, $pfp, $cost) {
        $stmt = $this->db->prepare("
            INSERT INTO premium_ndd (name, pfp, cost)
            VALUES (:name, :pfp, :cost)
            ON DUPLICATE KEY UPDATE pfp = :pfp2, cost = :cost2
        ");
        $stmt->bindParam(':name', $name);
        $stmt->bindParam(':pfp', $pfp);
        $stmt->bindParam(':pfp2', $pfp);
        $stmt->bindValue(':cost', $cost, PDO::PARAM_INT);
        $stmt->bindValue(':cost2', $cost, PDO::PARAM_INT);

        return $stmt->execute();
    }

    /**
     * Delete a premium NDD listing by name
     */
    public function delete($name) {
        $stmt = $this->db->prepare("
            DELETE FROM premium_ndd WHERE name = :name
        ");
        $stmt->bindParam(':name', $name);

        return $stmt->execute();
    }

    /**
     * Get a premium NDD by name
     */
    public function getByName($name) {
        $stmt = $this->db->prepare("
            SELECT name, pfp, cost
            FROM premium_ndd
            WHERE name = :name
            LIMIT 1
        ");
        $stmt->bindParam(':name', $name);
        $stmt->execute();

        return $stmt->fetch() ?: null;
    }
}
