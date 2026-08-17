import { config } from '../config.js';
import { createOperator, findByEmail } from '../db/operators.js';
import { hashPassword } from './password.js';

// Render 무료 티어처럼 Shell 접근이 없는 환경에서도 운영자 계정을 만들 수 있도록,
// 환경변수(BOOTSTRAP_OPERATOR_*, 번호 접미사로 여러 명 지정 가능)에 지정된 계정 중
// 아직 없는 이메일만 생성한다. 재배포마다 호출되지만 이미 있는 계정은 건너뛴다.
export async function bootstrapOperatorIfConfigured() {
  for (const { email, password, name } of config.bootstrapOperators) {
    const normalizedEmail = email.trim().toLowerCase();

    if (findByEmail(normalizedEmail)) {
      console.log(`[bootstrap] 운영자 계정이 이미 있습니다: ${normalizedEmail}`);
      continue;
    }

    const passwordHash = await hashPassword(password);
    createOperator({ email: normalizedEmail, passwordHash, name });
    console.log(`[bootstrap] 운영자 계정을 생성했습니다: ${normalizedEmail}`);
  }
}
