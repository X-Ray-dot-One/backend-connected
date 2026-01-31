use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    // ============================================================================
    // PRIVATE MESSAGES - Encrypted Instructions
    // ============================================================================
    //
    // Ces circuits s'exécutent dans le cluster MXE (Multi-Party Computation).
    // Les données restent chiffrées pendant tout le traitement.
    //
    // Pour les messages privés, on utilise un schéma hybride:
    // - Les messages sont chiffrés côté client avec la clé publique du destinataire
    // - Arcium est utilisé pour des opérations sur métadonnées chiffrées
    // ============================================================================

    // ============================================================================
    // PRIVATE MESSAGE - Vérification d'accès avec métadonnées cachées
    // ============================================================================

    /// Structure compacte pour la vérification d'accès
    /// On passe seulement les hashes nécessaires
    pub struct AccessCheck {
        /// Hash chiffré du recipient (stocké dans le message)
        recipient_hash: [u8; 32],
        /// Hash chiffré du requester (celui qui demande l'accès)
        requester_hash: [u8; 32],
    }

    /// Vérifie si le requester a accès (est-il le recipient?)
    /// Retourne 1 si autorisé, 0 sinon
    /// Simple et léger - pas de données volumineuses
    #[instruction]
    pub fn verify_and_reveal_sender(
        input: Enc<Shared, AccessCheck>,
    ) -> Enc<Shared, u8> {
        let check = input.to_arcis();

        // Compare les deux hashes de manière chiffrée
        let mut is_match: u8 = 1;
        for i in 0..32 {
            if check.recipient_hash[i] != check.requester_hash[i] {
                is_match = 0;
            }
        }

        input.owner.from_arcis(is_match)
    }

    // ============================================================================
    // SIMPLE TEST CIRCUIT - Pour vérifier que tout fonctionne
    // ============================================================================

    pub struct TestInput {
        a: u8,
        b: u8,
    }

    /// Simple addition pour tester le setup
    #[instruction]
    pub fn test_add(input: Enc<Shared, TestInput>) -> Enc<Shared, u16> {
        let i = input.to_arcis();
        let sum = i.a as u16 + i.b as u16;
        input.owner.from_arcis(sum)
    }
}
