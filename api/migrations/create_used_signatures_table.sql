-- Create table to track used transaction signatures (prevent replay attacks)
CREATE TABLE IF NOT EXISTS used_signatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    signature VARCHAR(128) NOT NULL UNIQUE,
    ndd_name VARCHAR(100) NOT NULL,
    shadow_pubkey VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL,
    INDEX idx_signature (signature)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
