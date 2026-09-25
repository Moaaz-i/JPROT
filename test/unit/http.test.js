import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CSP, SECURITY_HEADERS, sendWithSecurity, setFramePolicy } from '../../core/http.js'

function capture() {
  return {
    headers: {},
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    end() {},
  }
}

test('default policy blocks framing (X-Frame-Options DENY + frame-ancestors none)', () => {
  setFramePolicy([])
  const res = capture()
  sendWithSecurity(res, 200, 'text/html', '<p>hi</p>', 'abc')
  assert.equal(res.headers['X-Frame-Options'], 'DENY')
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/)
})

test('setFramePolicy removes X-Frame-Options and relaxes frame-ancestors', () => {
  setFramePolicy(['*'])
  const res = capture()
  sendWithSecurity(res, 200, 'text/html', '<p>hi</p>', 'abc')
  assert.equal(res.headers['X-Frame-Options'], undefined)
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors \*;/)
  // CORP must relax too, or Chromium still blanks a cross-origin iframe
  assert.equal(res.headers['Cross-Origin-Resource-Policy'], 'cross-origin')
  // everything else stays locked down
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff')
  assert.equal(res.headers['Permissions-Policy'], SECURITY_HEADERS['Permissions-Policy'])
  setFramePolicy([]) // restore default for any tests that run after
})

test('CSP() reflects the active framing policy', () => {
  setFramePolicy(['http://localhost:*'])
  assert.match(CSP('x'), /frame-ancestors http:\/\/localhost:\*;/)
  assert.doesNotMatch(CSP('x'), /frame-ancestors 'none'/)
  setFramePolicy([])
})