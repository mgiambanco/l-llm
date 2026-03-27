import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join, basename, dirname } from 'path'

export interface CheckResult {
  tool: string
  success: boolean
  output: string
}

const IS_WIN = process.platform === 'win32'

function run(cmd: string, args: string[], cwd: string): CheckResult | null {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf-8',
    timeout: 30_000,
    shell: IS_WIN,
  })
  if (r.error) return null  // command not installed
  return {
    tool: [cmd, ...args.slice(0, 2)].join(' '),
    success: r.status === 0,
    output: ((r.stdout ?? '') + (r.stderr ?? '')).trim(),
  }
}

export function lintFile(filePath: string, language: string, cwd: string): CheckResult | null {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      // tsc for type-checking; eslint if config present
      if (existsSync(join(cwd, 'tsconfig.json'))) {
        return run('npx', ['tsc', '--noEmit'], cwd)
      }
      return run('npx', ['tsc', '--noEmit', '--allowJs', '--checkJs',
        '--target', 'ES2020', '--moduleResolution', 'bundler', filePath], cwd)
    }
    case 'python':
      return run('ruff', ['check', filePath], cwd)
          ?? run('flake8', [filePath], cwd)
          ?? run('pylint', ['--errors-only', filePath], cwd)
    case 'rust':
      return existsSync(join(cwd, 'Cargo.toml'))
        ? run('cargo', ['clippy', '--quiet'], cwd)
        : null
    case 'go':
      return run('go', ['vet', filePath], cwd)
    case 'php':
      return run('php', ['-l', filePath], cwd)
    case 'ruby':
      return run('ruby', ['-wc', filePath], cwd)
    case 'lua':
      return run('luac', ['-p', filePath], cwd)
    default:
      return null
  }
}

export function buildCheck(filePath: string, language: string, cwd: string): CheckResult | null {
  switch (language) {
    case 'typescript':
    case 'javascript': {
      if (existsSync(join(cwd, 'tsconfig.json'))) {
        return run('npx', ['tsc', '--noEmit'], cwd)
      }
      return run('npx', ['tsc', '--noEmit', '--allowJs', '--checkJs',
        '--target', 'ES2020', '--moduleResolution', 'bundler', filePath], cwd)
    }
    case 'python':
      return run('python', ['-m', 'py_compile', filePath], cwd)
          ?? run('python3', ['-m', 'py_compile', filePath], cwd)
    case 'rust':
      return existsSync(join(cwd, 'Cargo.toml'))
        ? run('cargo', ['check', '--quiet'], cwd)
        : run('rustc', ['--edition', '2021', '--crate-type', 'lib', '--emit=metadata',
            '-o', '/dev/null', filePath], cwd)
    case 'go':
      return run('go', ['build', filePath], cwd)
    case 'java':
      return run('javac', ['-d', dirname(filePath), filePath], cwd)
    case 'kotlin':
      return run('kotlinc', [filePath, '-include-runtime', '-d', '/dev/null'], cwd)
    case 'csharp':
      return existsSync(join(cwd, 'project.csproj')) || existsSync(join(cwd, '*.csproj'))
        ? run('dotnet', ['build', '--nologo', '-q'], cwd)
        : null
    case 'swift':
      return run('swift', ['-typecheck', filePath], cwd)
    case 'elixir':
      return run('elixirc', ['--ignore-module-conflict', filePath], cwd)
    case 'haskell':
      return run('ghc', ['-fno-code', filePath], cwd)
    case 'zig':
      return run('zig', ['build-obj', '--cache-dir', '/tmp', filePath], cwd)
    default:
      return null
  }
}

// Derives the conventional test filename for a given source file + language
export function testFilename(sourceFile: string, language: string): string {
  const name = basename(sourceFile).replace(/\.[^.]+$/, '')
  const map: Record<string, string> = {
    typescript: `${name}.test.ts`,
    javascript: `${name}.test.js`,
    python:     `test_${name}.py`,
    go:         `${name}_test.go`,
    java:       `${name.charAt(0).toUpperCase() + name.slice(1)}Test.java`,
    kotlin:     `${name.charAt(0).toUpperCase() + name.slice(1)}Test.kt`,
    csharp:     `${name.charAt(0).toUpperCase() + name.slice(1)}Tests.cs`,
    ruby:       `${name}_spec.rb`,
    php:        `${name.charAt(0).toUpperCase() + name.slice(1)}Test.php`,
    swift:      `${name.charAt(0).toUpperCase() + name.slice(1)}Tests.swift`,
    rust:       `${name}_test.rs`,
    scala:      `${name.charAt(0).toUpperCase() + name.slice(1)}Spec.scala`,
    haskell:    `${name.charAt(0).toUpperCase() + name.slice(1)}Spec.hs`,
    elixir:     `${name}_test.exs`,
  }
  return map[language] ?? `${name}.test.txt`
}

export function runTests(testFile: string, language: string, cwd: string): CheckResult | null {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return run('npx', ['jest', '--no-coverage', testFile], cwd)
          ?? run('npx', ['vitest', 'run', testFile], cwd)
          ?? run('node', ['--test', testFile], cwd)
    case 'python':
      return run('pytest', [testFile, '-v'], cwd)
          ?? run('python', ['-m', 'pytest', testFile, '-v'], cwd)
          ?? run('python3', ['-m', 'pytest', testFile, '-v'], cwd)
    case 'rust':
      return run('cargo', ['test', '--quiet'], cwd)
    case 'go':
      return run('go', ['test', testFile], cwd)
    case 'java':
      return run('mvn', ['test', '-q'], cwd)
          ?? run('gradle', ['test', '-q'], cwd)
    case 'ruby':
      return run('rspec', [testFile], cwd)
          ?? run('ruby', [testFile], cwd)
    case 'elixir':
      return run('mix', ['test', testFile], cwd)
    case 'kotlin':
    case 'scala':
      return run('gradle', ['test', '-q'], cwd)
    case 'swift':
      return run('swift', ['test'], cwd)
    default:
      return null
  }
}
