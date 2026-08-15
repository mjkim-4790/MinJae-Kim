import { config } from '../config.js';
import { createOperator, findByEmail } from '../db/operators.js';
import { hashPassword } from './password.js';

// Render 무료 티어처럼 Shell 접근이 없는 환경에서도 최초 운영자 계정을 만들 수 있도록,
// 환경변수(BOOTSTRAP_OPERATOR_*)가 지정돼 있고 해당 이메일의 계정이 아직 없을 때만 생성한다.
export async function bootstrapOperatorIfConfigured() {
  const { email, password, name } = config.bootstrapOperator;
  if (!email || !password) return;

  if (findByEmail(email)) {
    console.log(`[bootstrap] 운영자 계정이 이미 있습니다: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  createOperator({ email, passwordHash, name });
  console.log(`[bootstrap] 운영자 계정을 생성했습니다: ${email}`);
}
