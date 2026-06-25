#!/usr/bin/env node
import { execSync } from 'child_process';

const ALLOW_OVERRIDE = process.env.ALLOW_PARTY_DEPLOY === '1' || process.env.ALLOW_PARTY_DEPLOY === 'rollback';

function fail(msg) {
  console.error(`\n❌ DEPLOY BLOCKED: ${msg}\n`);
  process.exit(1);
}

try {
  // Check current branch
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  if (branch !== 'main' && !ALLOW_OVERRIDE) {
    fail(`You are on branch "${branch}".\nOnly deploy from "main".\nUse ALLOW_PARTY_DEPLOY=1 for emergency rollbacks.`);
  }

  // Check for uncommitted changes
  const status = execSync('git status --porcelain').toString().trim();
  if (status && !ALLOW_OVERRIDE) {
    fail('Working tree is not clean. Commit or stash changes before deploying to PartyKit.');
  }

  console.log('✅ Deploy guard passed');
  console.log(`   Branch: ${branch}`);
  console.log(`   Working tree: clean`);
  if (ALLOW_OVERRIDE) {
    console.log('   ⚠️  Override enabled (emergency/rollback mode)');
  }
} catch (err) {
  fail(`Git command failed: ${err.message}`);
}
