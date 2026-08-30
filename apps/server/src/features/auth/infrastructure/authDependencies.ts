import { changeEmail, revokeToken } from '../../../services/account/accountIdentityService.js';
import { sendOtp, verifyOtp } from '../../../services/account/passwordResetOtpService.js';
import { deleteUserAccount as deleteFirebaseUserAccount } from '../../../services/firebase/userStore.js';
import { requestDeduper } from '../../../common/request/requestDeduper.js';
import type { AuthUseCaseDependencies } from '../ports.js';

export const authDependencies: AuthUseCaseDependencies = {
    accountGateway: {
        changeEmail,
        deleteUserAccount: deleteFirebaseUserAccount,
        revokeToken,
        sendOtp,
        verifyOtp,
    },
    requestDeduper,
};
