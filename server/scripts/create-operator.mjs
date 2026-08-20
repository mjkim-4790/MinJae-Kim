#!/usr/bin/env node
// MC(운영자) 계정 생성 CLI.
// §9 결정: 가입 기능 없이 개발자가 이 스크립트로 계정을 만들어 전달한다.
//
// 사용법:
//   node server/scripts/create-operator.mjs --email mc@example.com --name "홍길동" --password "..."
//   (--password 생략 시 무작위 임시 비밀번호를 생성해 출력한다)

import crypto from 'node:crypto';

import { hashPassword } from '../src/auth/password.js';
import { createOperator, findByEmail } from '../src/db/operators.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url'); // 12자 내외
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email ?? '').trim().toLowerCase();
  const name = String(args.name ?? '').trim();
  const password = typeof args.password === 'string' ? args.password : generatePassword();
  const accountType = args.type === 'personal' ? 'personal' : 'mc';

  if (!email || !name) {
    console.error('사용법: node server/scripts/create-operator.mjs --email <이메일> --name <이름> [--password <비밀번호>]');
    process.exit(1);
  }

  if (findByEmail(email)) {
    console.error(`이미 존재하는 이메일입니다: ${email}`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const operator = createOperator({ email, passwordHash, name, accountType });

  console.log('운영자 계정이 생성되었습니다.');
  console.log(`  id       : ${operator.id}`);
  console.log(`  email    : ${operator.email}`);
  console.log(`  name     : ${operator.name}`);
  console.log(`  type     : ${operator.account_type}`);
  console.log(`  password : ${password}`);
  console.log('※ 비밀번호는 다시 조회할 수 없으니 지금 전달하세요.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
