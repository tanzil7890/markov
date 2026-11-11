import { describe, expect, it } from 'vitest'
import {
  foldWslUncPathCaseInsensitiveParts,
  getWslFilesystemBoundaryDistro,
  isDrvfsLinuxPath,
  resolveWslRepoWorktreeBasePath,
  toWindowsWslDrivePath,
  toWindowsWslPath
} from './wsl-paths'

describe('wsl path helpers', () => {
  it.each([
    ['/home/sam/repo', '\\\\wsl.localhost\\Ubuntu\\home\\sam\\repo'],
    ['/', '\\\\wsl.localhost\\Ubuntu\\'],
    ['/mnt/c/Users/sam', 'C:\\Users\\sam'],
    ['/MNT/c/Repo', '\\\\wsl.localhost\\Ubuntu\\MNT\\c\\Repo'],
    ['/mnt/C/Repo', '\\\\wsl.localhost\\Ubuntu\\mnt\\C\\Repo']
  ])('converts %s without folding case-sensitive Linux paths', (linuxPath, expected) => {
    expect(toWindowsWslPath(linuxPath, 'Ubuntu')).toBe(expected)
  })

  it.each([
    ['/mnt/c/Users/sam', 'C:\\Users\\sam'],
    ['/mnt/d', 'D:\\'],
    ['/mnt/d/', 'D:\\'],
    ['/MNT/c/Users/sam', null],
    ['/mnt/C/Repo', null],
    ['/home/sam', null],
    // A drvfs prefix on a line that still carries a terminator is not a drive path.
    ['/mnt/c/Users/sam\r', null],
    ['/mnt/c/Users/sam\n', null],
    ['/mnt/c/Users/sam\u2028', null],
    ['/mnt/c/Users/sam\u2029', null]
  ] as const)('converts the DrvFs path %j without a distro lookup', (linuxPath, expected) => {
    expect(toWindowsWslDrivePath(linuxPath)).toBe(expected)
  })
})

describe('resolveWslRepoWorktreeBasePath', () => {
  const WSL_REPO = '\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\src\\repo'

  it('resolves an absolute Linux base path into the repo distro (STA-4772)', () => {
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '/home/sam/project/.markov-worktrees')).toBe(
      '\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\project\\.markov-worktrees'
    )
    expect(resolveWslRepoWorktreeBasePath('\\\\wsl$\\Debian\\srv\\repo', '/srv/trees')).toBe(
      '\\\\wsl.localhost\\Debian\\srv\\trees'
    )
  })

  it('keeps drvfs base paths on the distro UNC view so mirroring cannot discard them', () => {
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '/mnt/d/trees')).toBe(
      '\\\\wsl.localhost\\Ubuntu-24.04\\mnt\\d\\trees'
    )
  })

  it('collapses dot segments and trailing slashes so ownership layouts match creation', () => {
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '/home/sam/src/../trees')).toBe(
      '\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\trees'
    )
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '/home/sam/./trees/')).toBe(
      '\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\trees'
    )
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '/../..')).toBe(
      '\\\\wsl.localhost\\Ubuntu-24.04\\'
    )
  })

  it('keeps UNC, drive, and relative base paths untouched for WSL repos', () => {
    expect(
      resolveWslRepoWorktreeBasePath(WSL_REPO, '\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\trees')
    ).toBe('\\\\wsl.localhost\\Ubuntu-24.04\\home\\sam\\trees')
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '//wsl.localhost/Ubuntu-24.04/trees')).toBe(
      '//wsl.localhost/Ubuntu-24.04/trees'
    )
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, 'D:\\trees')).toBe('D:\\trees')
    expect(resolveWslRepoWorktreeBasePath(WSL_REPO, '../worktrees')).toBe('../worktrees')
  })
})

describe('foldWslUncPathCaseInsensitiveParts', () => {
  it('folds share spelling, distro casing, and separators but not the Linux tail', () => {
    expect(foldWslUncPathCaseInsensitiveParts('\\\\WSL$\\Ubuntu\\home\\sam\\Repo')).toBe(
      '//wsl.localhost/ubuntu/home/sam/Repo'
    )
    expect(foldWslUncPathCaseInsensitiveParts('//wsl.localhost/UBUNTU/home/sam/Repo')).toBe(
      '//wsl.localhost/ubuntu/home/sam/Repo'
    )
  })

  it('folds drvfs automount tails but not other /mnt entries', () => {
    expect(foldWslUncPathCaseInsensitiveParts('\\\\wsl$\\Ubuntu\\mnt\\C\\Users\\Sam')).toBe(
      '//wsl.localhost/ubuntu/mnt/c/users/sam'
    )
    expect(foldWslUncPathCaseInsensitiveParts('\\\\wsl$\\Ubuntu\\mnt\\wsl\\Data')).toBe(
      '//wsl.localhost/ubuntu/mnt/wsl/Data'
    )
  })

  it('does not treat a case-variant /MNT dir as the drvfs automount', () => {
    expect(foldWslUncPathCaseInsensitiveParts('\\\\wsl$\\Ubuntu\\MNT\\c\\Repo')).toBe(
      '//wsl.localhost/ubuntu/MNT/c/Repo'
    )
  })
})

describe('getWslFilesystemBoundaryDistro', () => {
  // UNC drvfs paths cross onto the Windows drive regardless of runtime preference.
  it('names the path distro for the UNC spelling of a drvfs mount', () => {
    expect(
      getWslFilesystemBoundaryDistro({
        projectPath: '\\\\wsl.localhost\\Ubuntu\\mnt\\c\\Users\\alice\\markov'
      })
    ).toBe('Ubuntu')
  })
})

describe('isDrvfsLinuxPath', () => {
  it('accepts the automount root and its descendants only', () => {
    expect(isDrvfsLinuxPath('/mnt/c')).toBe(true)
    expect(isDrvfsLinuxPath('/mnt/c/Users')).toBe(true)
    expect(isDrvfsLinuxPath('/mnt/cdrom')).toBe(false)
    // /MNT and /mnt/C are case-sensitive Linux directories, not drvfs automounts.
    expect(isDrvfsLinuxPath('/MNT/c')).toBe(false)
    expect(isDrvfsLinuxPath('/mnt/C/Users')).toBe(false)
  })
})
