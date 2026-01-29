<?php
require_once __DIR__ . '/../models/User.php';
require_once __DIR__ . '/AuthController.php';

class ProfileController {
    private $userModel;

    public function __construct() {
        $this->userModel = new User();
    }

    /**
     * Check if user has completed their profile
     */
    public function hasProfile() {
        header('Content-Type: application/json');

        if (!AuthController::isLoggedIn()) {
            echo json_encode(['success' => false, 'error' => 'Not authenticated']);
            exit;
        }

        $userId = AuthController::getCurrentUserId();
        $user = $this->userModel->findById($userId);

        echo json_encode([
            'success' => true,
            'has_profile' => !empty($user['username']),
            'username' => $user['username'] ?? null,
            'profile_picture' => $user['profile_picture'] ?? null,
            'bio' => $user['bio'] ?? null,
            'location' => $user['location'] ?? null,
            'website' => $user['website'] ?? null,
            'banner_picture' => $user['banner_picture'] ?? null
        ]);
        exit;
    }

    /**
     * Get full profile data
     */
    public function getProfile() {
        header('Content-Type: application/json');

        if (!AuthController::isLoggedIn()) {
            echo json_encode(['success' => false, 'error' => 'Not authenticated']);
            exit;
        }

        $userId = AuthController::getCurrentUserId();
        $user = $this->userModel->findById($userId);

        echo json_encode([
            'success' => true,
            'profile' => [
                'username' => $user['username'] ?? null,
                'profile_picture' => $user['profile_picture'] ?? null,
                'bio' => $user['bio'] ?? null,
                'location' => $user['location'] ?? null,
                'website' => $user['website'] ?? null,
                'banner_picture' => $user['banner_picture'] ?? null
            ]
        ]);
        exit;
    }

    /**
     * Update user profile
     */
    public function updateProfile() {
        header('Content-Type: application/json');

        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
            exit;
        }

        if (!AuthController::isLoggedIn()) {
            echo json_encode(['success' => false, 'error' => 'Not authenticated']);
            exit;
        }

        // Support both JSON and form data
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        if (strpos($contentType, 'application/json') !== false) {
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $username = trim($input['username'] ?? '');
            $bio = trim($input['bio'] ?? '');
            $location = trim($input['location'] ?? '');
            $website = trim($input['website'] ?? '');
        } else {
            $username = trim($_POST['username'] ?? '');
            $bio = trim($_POST['bio'] ?? '');
            $location = trim($_POST['location'] ?? '');
            $website = trim($_POST['website'] ?? '');
        }
        $profilePicturePath = null;
        $bannerPicturePath = null;

        // Validation
        $errors = [];

        if (empty($username)) {
            $errors[] = "Username is required";
        } elseif (strlen($username) < 3) {
            $errors[] = "Username must be at least 3 characters";
        } elseif (strlen($username) > 50) {
            $errors[] = "Username must not exceed 50 characters";
        } elseif (!preg_match('/^[a-zA-Z0-9_]+$/', $username)) {
            $errors[] = "Username can only contain letters, numbers, and underscores";
        }

        // Bio validation (max 500 chars)
        if (strlen($bio) > 500) {
            $errors[] = "Bio must not exceed 500 characters";
        }

        // Website validation
        if (!empty($website)) {
            // Remove protocol if present
            $website = preg_replace('#^https?://#', '', $website);

            // Check for dangerous TLDs
            $dangerousTlds = ['.ru', '.cn', '.tk', '.ml', '.ga', '.cf', '.gq', '.zip', '.mov'];
            foreach ($dangerousTlds as $tld) {
                if (str_ends_with(strtolower($website), $tld)) {
                    $errors[] = "This domain extension is not allowed";
                    break;
                }
            }
        }

        if (!empty($errors)) {
            echo json_encode(['success' => false, 'errors' => $errors]);
            exit;
        }

        $userId = AuthController::getCurrentUserId();

        // Check if username is already taken (by another user)
        $existingUser = $this->userModel->findByUsername($username);
        if ($existingUser && $existingUser['id'] != $userId) {
            echo json_encode(['success' => false, 'errors' => ['Username is already taken']]);
            exit;
        }

        // Handle profile picture upload
        if (isset($_FILES['profile_picture']) && $_FILES['profile_picture']['error'] === UPLOAD_ERR_OK) {
            $profilePicturePath = $this->handleImageUpload($_FILES['profile_picture'], 'profile', $userId);
            if ($profilePicturePath === false) {
                echo json_encode(['success' => false, 'errors' => ['Failed to upload profile picture']]);
                exit;
            }
        }

        // Handle banner picture upload
        if (isset($_FILES['banner_picture']) && $_FILES['banner_picture']['error'] === UPLOAD_ERR_OK) {
            $bannerPicturePath = $this->handleImageUpload($_FILES['banner_picture'], 'banner', $userId);
            if ($bannerPicturePath === false) {
                echo json_encode(['success' => false, 'errors' => ['Failed to upload banner picture']]);
                exit;
            }
        }

        // Update profile
        $success = $this->userModel->updateFullProfile($userId, [
            'username' => $username,
            'bio' => $bio,
            'location' => $location,
            'website' => $website,
            'profile_picture' => $profilePicturePath,
            'banner_picture' => $bannerPicturePath
        ]);

        if ($success) {
            $user = $this->userModel->findById($userId);
            echo json_encode([
                'success' => true,
                'profile' => [
                    'username' => $user['username'],
                    'profile_picture' => $user['profile_picture'],
                    'bio' => $user['bio'],
                    'location' => $user['location'],
                    'website' => $user['website'],
                    'banner_picture' => $user['banner_picture']
                ]
            ]);
        } else {
            echo json_encode(['success' => false, 'errors' => ['Failed to update profile']]);
        }
        exit;
    }

    /**
     * Handle image upload
     */
    private function handleImageUpload($file, $type, $userId) {
        // Validate file type
        $allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!in_array($file['type'], $allowedTypes)) {
            return false;
        }

        // Validate file size (max 7MB for profile, 7MB for banner)
        $maxSize = 7 * 1024 * 1024;
        if ($file['size'] > $maxSize) {
            return false;
        }

        // Generate unique filename
        $extension = pathinfo($file['name'], PATHINFO_EXTENSION);
        $filename = $type . '_' . $userId . '_' . time() . '.' . $extension;
        $uploadDir = __DIR__ . '/../../public/uploads/profile_pictures/';

        // Create directory if it doesn't exist
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $uploadPath = $uploadDir . $filename;

        // Move uploaded file
        if (move_uploaded_file($file['tmp_name'], $uploadPath)) {
            return 'public/uploads/profile_pictures/' . $filename;
        }

        return false;
    }
}
