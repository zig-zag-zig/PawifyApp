import { describe, expect, it, vi, beforeEach } from 'vitest';

const { clientDeleteUser } = vi.hoisted(() => ({
    clientDeleteUser: vi.fn(async () => {}),
}));

vi.mock('../../../firebase/firebaseAuth', () => ({
    auth: {
        currentUser: null as { uid: string } | null,
    },
}));
vi.mock('firebase/auth', () => ({
    deleteUser: clientDeleteUser,
}));
// avoid loading native/heavy transitive deps brought in by the rest of the hook module
vi.mock('@react-navigation/native', () => ({
    useFocusEffect: vi.fn(),
    useNavigation: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../../../hooks/useGoogleAuth', () => ({ useGoogleAuth: {} }));
vi.mock('../api/authApi', () => ({ useAuthApi: () => ({}) }));
// break the ToastContext → InfoBanner → @expo/vector-icons chain
vi.mock('../../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../services/userFacingErrors', () => ({ getUserFacingErrorMessage: vi.fn(() => 'failed') }));
vi.mock('../state/authReducers', () => ({
    createInitialSecurityState: vi.fn(() => ({})),
    securityReducer: vi.fn(() => ({})),
}));

import { deleteAccount } from './useSecurityPage';
import { auth } from '../../../firebase/firebaseAuth';

describe('deleteAccount', () => {
    beforeEach(() => {
        clientDeleteUser.mockClear();
        (auth.currentUser as { uid: string } | null) = { uid: 'user-1' };
    });

    it('delegates deletion to the backend and returns true', async () => {
        const deleteUserAccount = vi.fn(async () => 'ok');

        const result = await deleteAccount(deleteUserAccount);

        expect(deleteUserAccount).toHaveBeenCalledTimes(1);
        expect(result).toBe(true);
    });

    it('does not call the Firebase client deleteUser (backend owns identity deletion)', async () => {
        const deleteUserAccount = vi.fn(async () => 'ok');

        await deleteAccount(deleteUserAccount);

        expect(clientDeleteUser).not.toHaveBeenCalled();
    });

    it('returns false when no current user is available', async () => {
        (auth.currentUser as { uid: string } | null) = null;
        const deleteUserAccount = vi.fn(async () => 'ok');

        const result = await deleteAccount(deleteUserAccount);

        expect(result).toBe(false);
        expect(deleteUserAccount).not.toHaveBeenCalled();
        expect(clientDeleteUser).not.toHaveBeenCalled();
    });

    it('propagates backend deletion failures', async () => {
        const deleteUserAccount = vi.fn(async () => {
            throw new Error('backend failed');
        });

        await expect(deleteAccount(deleteUserAccount)).rejects.toThrow('backend failed');
        expect(clientDeleteUser).not.toHaveBeenCalled();
    });
});
