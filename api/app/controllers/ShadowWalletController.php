<?php
require_once __DIR__ . '/../models/ShadowWallet.php';

class ShadowWalletController {
    private $shadowWalletModel;

    public function __construct() {
        $this->shadowWalletModel = new ShadowWallet();
    }

    /**
     * GET /api/wallets/count/:userId
     * Récupère le nombre de wallets générés pour un user
     */
    public function getCount() {
        header('Content-Type: application/json');

        $userId = $_GET['userId'] ?? null;

        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'userId is required']);
            exit;
        }

        // Validate userId format (should be a hash, typically 64 chars hex)
        if (!preg_match('/^[a-fA-F0-9]{16,64}$/', $userId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid userId format']);
            exit;
        }

        $count = $this->shadowWalletModel->getWalletCount($userId);

        echo json_encode(['count' => $count]);
        exit;
    }

    /**
     * GET /api/wallets/is-premium/:walletAddress
     * Vérifie si une adresse wallet est premium et retourne sa photo de profil
     */
    public function isPremium() {
        header('Content-Type: application/json');

        $walletAddress = $_GET['walletAddress'] ?? null;

        if (!$walletAddress) {
            http_response_code(400);
            echo json_encode(['error' => 'walletAddress is required']);
            exit;
        }

        // Validate Solana address format
        if (!preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $walletAddress)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid wallet address format']);
            exit;
        }

        $result = $this->shadowWalletModel->isPremium($walletAddress);

        echo json_encode([
            'is_premium' => $result['is_premium'],
            'profile_picture' => $result['profile_picture']
        ]);
        exit;
    }

    /**
     * POST /api/wallets/set-premium
     * Définit le statut premium d'une adresse wallet
     */
    public function setPremium() {
        header('Content-Type: application/json');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $walletAddress = $input['walletAddress'] ?? null;
        $isPremium = $input['is_premium'] ?? true;

        if (!$walletAddress) {
            http_response_code(400);
            echo json_encode(['error' => 'walletAddress is required']);
            exit;
        }

        // Validate Solana address format
        if (!preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $walletAddress)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid wallet address format']);
            exit;
        }

        $success = $this->shadowWalletModel->setPremium($walletAddress, (bool)$isPremium);

        if ($success) {
            echo json_encode([
                'success' => true,
                'is_premium' => (bool)$isPremium
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to update premium status']);
        }
        exit;
    }

    /**
     * POST /api/wallets/increment
     * Incrémente le compteur de wallets (+1)
     */
    public function increment() {
        header('Content-Type: application/json');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $userId = $input['userId'] ?? null;

        if (!$userId) {
            http_response_code(400);
            echo json_encode(['error' => 'userId is required']);
            exit;
        }

        // Validate userId format
        if (!preg_match('/^[a-fA-F0-9]{16,64}$/', $userId)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid userId format']);
            exit;
        }

        $count = $this->shadowWalletModel->incrementWalletCount($userId);

        if ($count !== false) {
            echo json_encode(['count' => $count]);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to increment count']);
        }
        exit;
    }

    /**
     * POST /api/wallets
     * Enregistre un nouveau shadow wallet avec son nom
     */
    public function create() {
        header('Content-Type: application/json');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $shadowPubkey = $input['shadowPubkey'] ?? null;
        $name = trim($input['name'] ?? '');

        // Validate shadowPubkey (Solana address format)
        if (!$shadowPubkey || !preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $shadowPubkey)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid shadowPubkey format']);
            exit;
        }

        // Validate name
        if (empty($name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Name is required']);
            exit;
        }

        if (strlen($name) > 100) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Name too long (max 100 chars)']);
            exit;
        }

        // Check if name already exists
        if ($this->shadowWalletModel->nameExists($name)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'Name already exists']);
            exit;
        }

        $success = $this->shadowWalletModel->createShadowWallet($shadowPubkey, $name);

        if ($success) {
            echo json_encode(['success' => true]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Failed to create shadow wallet']);
        }
        exit;
    }

    /**
     * GET /api/wallets/name-exists/:name
     * Vérifie si un nom existe déjà
     */
    public function nameExists() {
        header('Content-Type: application/json');

        $name = $_GET['name'] ?? null;

        if (!$name) {
            http_response_code(400);
            echo json_encode(['error' => 'Name is required']);
            exit;
        }

        $exists = $this->shadowWalletModel->nameExists($name);

        echo json_encode(['exists' => $exists]);
        exit;
    }

    /**
     * GET /api/wallets/name/:shadowPubkey
     * Récupère le nom d'un shadow wallet par son adresse
     */
    public function getName() {
        header('Content-Type: application/json');

        $shadowPubkey = $_GET['shadowPubkey'] ?? null;

        if (!$shadowPubkey) {
            http_response_code(400);
            echo json_encode(['error' => 'shadowPubkey is required']);
            exit;
        }

        // Validate shadowPubkey format
        if (!preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $shadowPubkey)) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid shadowPubkey format']);
            exit;
        }

        $name = $this->shadowWalletModel->getNameByPubkey($shadowPubkey);

        echo json_encode(['name' => $name]);
        exit;
    }

    /**
     * GET /api/wallets/search?q=query
     * Recherche des shadow wallets par nom
     */
    public function search() {
        header('Content-Type: application/json');

        $query = trim($_GET['q'] ?? '');

        if (strlen($query) < 1) {
            echo json_encode(['success' => true, 'wallets' => []]);
            exit;
        }

        $wallets = $this->shadowWalletModel->searchByName($query);

        echo json_encode([
            'success' => true,
            'wallets' => $wallets
        ]);
        exit;
    }

    /**
     * POST /api/wallets/batch
     * Récupère les infos (nom + premium) de plusieurs wallets en une seule requête
     */
    public function getBatch() {
        header('Content-Type: application/json');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $wallets = $input['wallets'] ?? [];

        if (!is_array($wallets) || count($wallets) === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'wallets array is required']);
            exit;
        }

        // Limit to 100 wallets per request
        if (count($wallets) > 100) {
            $wallets = array_slice($wallets, 0, 100);
        }

        // Validate all wallet addresses
        $validWallets = [];
        foreach ($wallets as $wallet) {
            if (preg_match('/^[1-9A-HJ-NP-Za-km-z]{32,44}$/', $wallet)) {
                $validWallets[] = $wallet;
            }
        }

        if (count($validWallets) === 0) {
            echo json_encode(['success' => true, 'results' => []]);
            exit;
        }

        $results = $this->shadowWalletModel->getBatchInfo($validWallets);

        echo json_encode([
            'success' => true,
            'results' => $results
        ]);
        exit;
    }

    /**
     * GET /api/wallets/by-name?name=xxx
     * Récupère un shadow wallet par son nom
     */
    public function getByName() {
        header('Content-Type: application/json');

        $name = $_GET['name'] ?? null;

        if (!$name) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Name is required']);
            exit;
        }

        $wallet = $this->shadowWalletModel->getByName($name);

        if ($wallet) {
            echo json_encode([
                'success' => true,
                'wallet' => $wallet
            ]);
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Shadow wallet not found']);
        }
        exit;
    }
}
