// Probe all plausible Node paths directly, independent of shell startup-file behavior.

// sshd exec lacks profile-only MISE_DATA_DIR/NVM_DIR; read relocated data-dir assignments from dotfiles.
export const REMOTE_NODE_PATH_PROBE_SCRIPT = `
command -v node 2>/dev/null
markov_dotfile_dirs() {
  markov_var_name=$1
  markov_dirs=$2
  for markov_file in "$HOME/.profile" "$HOME/.bash_profile" "$HOME/.bashrc" "$HOME/.zprofile" "$HOME/.zshrc"
  do
    [ -r "$markov_file" ] || continue
    markov_dir_from_file=$(sed -n "s/^[[:space:]]*export[[:space:]][[:space:]]*$markov_var_name[[:space:]]*=[[:space:]]*//p; s/^[[:space:]]*$markov_var_name[[:space:]]*=[[:space:]]*//p" "$markov_file" | tail -n 1)
    case "$markov_dir_from_file" in
      \\"*\\") markov_dir_from_file=\${markov_dir_from_file#\\"}; markov_dir_from_file=\${markov_dir_from_file%%\\"*} ;;
      \\'*\\') markov_dir_from_file=\${markov_dir_from_file#\\'}; markov_dir_from_file=\${markov_dir_from_file%%\\'*} ;;
      *) markov_dir_from_file=\${markov_dir_from_file%%[[:space:]]*} ;;
    esac
    case "$markov_dir_from_file" in
      '$XDG_DATA_HOME'*) markov_dir_from_file="\${XDG_DATA_HOME:-$HOME/.local/share}\${markov_dir_from_file#'$XDG_DATA_HOME'}" ;;
      '$HOME'*) markov_dir_from_file="$HOME\${markov_dir_from_file#'$HOME'}" ;;
      "~/"*) markov_dir_from_file="$HOME/\${markov_dir_from_file#\\~/}" ;;
    esac
    [ -n "$markov_dir_from_file" ] && markov_dirs="$markov_dirs
$markov_dir_from_file"
  done
  printf '%s\\n' "$markov_dirs"
}
nvm_dirs=\${NVM_DIR:-"$HOME/.nvm"}
nvm_dirs=$(markov_dotfile_dirs NVM_DIR "$nvm_dirs")
printf '%s\\n' "$nvm_dirs" | while IFS= read -r nvm_dir
do
  [ -n "$nvm_dir" ] || continue
  for candidate in "$nvm_dir"/versions/node/*/bin/node
  do
    [ -x "$candidate" ] && printf '%s\\n' "$candidate"
  done
done
mise_dirs=\${MISE_DATA_DIR:-\${XDG_DATA_HOME:-$HOME/.local/share}/mise}
mise_dirs=$(markov_dotfile_dirs MISE_DATA_DIR "$mise_dirs")
printf '%s\\n' "$mise_dirs" | while IFS= read -r mise_dir
do
  [ -n "$mise_dir" ] || continue
  [ -x "$mise_dir/shims/node" ] && printf '%s\\n' "$mise_dir/shims/node"
  for candidate in "$mise_dir"/installs/node/*/bin/node
  do
    [ -x "$candidate" ] && printf '%s\\n' "$candidate"
  done
done
for candidate in \\
  /usr/local/bin/node \\
  /opt/homebrew/bin/node \\
  "$HOME/.local/bin/node" \\
  "$HOME/.fnm/aliases/default/bin/node" \\
  "$HOME/.fnm/node-versions"/*/installation/bin/node \\
  "$HOME/.local/share/fnm/node-versions"/*/installation/bin/node \\
  "$HOME/.local/share/mise/shims/node" \\
  "$HOME/.local/share/mise/installs/node"/*/bin/node \\
  "$HOME/.asdf/shims/node" \\
  "$HOME/.asdf/installs/nodejs"/*/bin/node \\
  "$HOME/.volta/bin/node" \\
  /usr/local/n/versions/node/*/bin/node
do
  [ -x "$candidate" ] && printf '%s\\n' "$candidate"
done
true
`
