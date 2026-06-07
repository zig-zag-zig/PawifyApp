import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '../../../firebase/firebaseAuth';
import { getUserFacingErrorMessage } from '../../../services/userFacingErrors';

export async function signUpWithEmail(email: string, password: string): Promise<void> {
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(getUserFacingErrorMessage(error, 'Registration failed. Please try again.'));
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(getUserFacingErrorMessage(error, 'Invalid email or password. Please try again.'));
  }
}
