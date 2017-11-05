---
title: 树莓派提高shell逼格oh-my-zsh
date: 2017-09-04 10:28:00
categories:
  - Linux
  - Software
tags:
  - Zsh
  - Software
top: 
sticky:
comments: true
password: 
---
*20170904 初成文，未完...
20171012 更新插件及alias方案*
技术可以菜，但写代码的方式一定要帅！

<!-- more -->

查看当前系统可用的shell
```bash
cat /etc/shells
```
{% blockquote %}
Shell是Linux/Unix的一个外壳，你理解成衣服也行。它负责外界与Linux内核的交互，接收用户或其他应用程序的命令，然后把这些命令转化成内核能理解的语言，传给内核，内核是真正干活的，干完之后再把结果返回用户或应用程序。
Linux/Unix提供了很多种Shell，为毛要这么多Shell？难道用来炒着吃么？那我问你，你同类型的衣服怎么有那么多件？花色，质地还不一样。写程序比买衣服复杂多了，而且程序员往往负责把复杂的事情搞简单，简单的事情搞复杂。牛程序员看到不爽的Shell，就会自己重新写一套，慢慢形成了一些标准，常用的Shell有这么几种，sh、bash、csh等”{% endblockquote %}

zsh强大之处在于命令补全，可以补齐路径，补齐命令，补齐参数等，只需按TAB键；另外还有跳转目录、通配符搜索、别名、历史记录等等...还有几百种插件拓展

# 安装zsh

```bash
sudo apt install zsh
```

# 安装ohmyzsh
两种方式，二选其一

1. 通过wget下载安装脚本

```bash
sh -c "$(wget https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh -O -)"
```

2. 通过curl下载安装脚本

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"
```

# 更换主题及部分参数说明

```bash
sudo nano ~/.zshrc
export PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/root/bin
export TERM=xterm-256color    //使终端支持256色，tput colors或echo $TERM显示是否正确开启
ZSH_THEME="agnoster"    //改为random会在每次打开终端或执行zsh随机选择一种主题风格
plugins=(git autojump zsh-syntax-highlighting)    //使用的插件
DISABLE_AUTO_UPDATE="true"    //关闭自动更新
ENABLE_CORRECTION="true"    //开启智能更正选项
CASE_SENSITIVE="true"    //对大小写敏感
alias g='git'    //别名设置
```

# 安装powerline字体
agnoster等主题依赖powerline字体，需安装缺失字体
```bash
wget https://raw.githubusercontent.com/powerline/powerline/develop/font/10-powerline-symbols.conf
wget https://raw.githubusercontent.com/powerline/powerline/develop/font/PowerlineSymbols.otf
sudo mkdir /usr/share/fonts
sudo mkdir /usr/share/fonts/OTF
sudo cp 10-powerline-symbols.conf /usr/share/fonts/OTF/
sudo mkdir /etc/fonts
sudo mkdir /etc/fonts/conf.d
sudo mv 10-powerline-symbols.conf /etc/fonts/conf.d/
sudo mv PowerlineSymbols.otf /usr/share/fonts/OTF/
```

# 切换默认shell

```bash
chsh -s /bin/zsh
```

# 插件

```bash
ls ~/.oh-my-zsh/plugins    //列出内置可用插件
```

直接在~/.zshrc里添加即可，部分需要安装，比如指令高亮插件：

```bash
git clone git://github.com/jimmijj/zsh-syntax-highlighting ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
plugins=(zsh-syntax-highlighting)  //终端命令提示，正确为绿色，错误为红色
```

我自己使用的插件（仅供参考）：

```
plugins=(git sudo colored-man-pages last-working-dir command-not-found cp debian common-aliases dirhistory systemd extract autojump zsh-syntax-highlighting zsh-autosuggestions command-time you-should-use auto-ls)
```
部分插件说明
sudo    //忘了加sudo只需按两下Esc键
colored-man-pages    //man手册页面，高亮版，更容易阅读
last-working-dir    //返回上次打开终端的目录
command-time    //显示某命令执行完成所用的时间
zsh-autosuggestions    //根据使用习惯自动显示建议，按→补充
zsh-you-should-use    //提示可用的alias，可配置
dirhistory    //使用alt+左右方向键来切换历史上级或下级目录
上面需自行安装的插件：

```bash
wget -O $ZSH_CUSTOM/auto-ls.zsh https://raw.githubusercontent.com/desyncr/auto-ls/master/auto-ls.zsh
git clone git://github.com/jimmijj/zsh-syntax-highlighting ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting
git clone git://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions
git clone https://github.com/popstas/zsh-command-time.git ~/.oh-my-zsh/custom/plugins/command-time
git clone https://github.com/MichaelAquilina/zsh-you-should-use.git ~/.oh-my-zsh/custom/plugins/you-should-use
```

# 别名方案
仅供参考，可按个人使用习惯自行修改

```bash
alias zshconfig="sudo nano ~/.zshrc"
alias wget="wget -c"
#alias df="pydf"
alias du="du -h"
alias df="df -Th"
alias cp="cp -iv"
alias mv="mv -iv"
alias rm="rm -iv"
alias ls="ls -F --color=auto"
alias ll="ls -alF"
alias la="ls -aF"
alias lll="ls -Alh --sort=size . | tr -s " " | cut -d " " -f 5,9"
alias dumax="du -hsx * | sort -rh | head -10"
alias grep="grep --color=auto"
alias fm="free -m"
alias ua="uname -a"
alias acs="apt-cache search"
alias ats="sudo aptitude show"
alias ati="sudo aptitude install -y"
alias aud="sudo aptitude update && sudo aptitude upgrade"
alias cat="pygmentize -O style=borland -f console256 -g" 
alias nnao="nano"
alias nano="sudo nano"
```

# 个人.zshrc完整配置
如下：
```bash
export ZSH=$HOME/.oh-my-zsh
export YSU_MODE=ALL
export TERM=xterm-256color
export LANG=en_US.UTF-8
ZSH_THEME="random"
CASE_SENSITIVE="true"
ENABLE_CORRECTION="true"
HIST_STAMPS="yyyy-mm-dd"
ZSH_COMMAND_TIME_MIN_SECONDS=1
ZSH_COMMAND_TIME_ECHO=1
[[ -s ~/.autojump/etc/profile.d/autojump.sh ]] && . ~/.autojump/etc/profile.d/autojump.sh
plugins=(git sudo colored-man-pages last-working-dir command-not-found cp debian common-aliases dirhistory systemd extract autojump zsh-syntax-highlighting zsh-autosuggestions command-time you-should-use auto-ls)
source $ZSH/oh-my-zsh.sh
alias zshconfig="sudo nano ~/.zshrc"
alias wget="wget -c"
#alias df="pydf"
alias du="du -h"
alias df="df -Th"
alias cp="cp -iv"
alias mv="mv -iv"
alias rm="rm -iv"
alias ls="ls -F --color=auto"
alias ll="ls -alF"
alias la="ls -aF"
alias lll="ls -Alh --sort=size . | tr -s " " | cut -d " " -f 5,9"
alias dumax="du -hsx * | sort -rh | head -10"
alias grep="grep --color=auto"
alias fm="free -m"
alias ua="uname -a"
alias acs="apt-cache search"
alias ats="sudo aptitude show"
alias ati="sudo aptitude install -y"
alias aud="sudo aptitude update && sudo aptitude upgrade"
alias cat="pygmentize -O style=borland -f console256 -g" 
alias nnao="nano"
alias nano="sudo nano"
alias hn="hexo new"
alias hs="hexo server --debug"
alias hc="hexo clean --debug"
alias hg="hexo generate --debug"
alias hd="hexo deploy --debug"
alias hcgs="hexo clean --debug && hexo generate --debug && hexo server --debug"
alias hcgd="hexo clean --debug && hexo generate --debug && hexo deploy --debug"
```
参考文章：
[你好，Oh My Zsh - 社区力量全新方式定义命令行](http://www.cnblogs.com/theswiftworld/p/omz.html)
[分享一下，你们都用了什么 oh my zsh 插件？](https://www.v2ex.com/t/156997)
[Linux终极shell-Z Shell--用强大的zsh & oh-my-zsh把Bash换掉](http://blog.csdn.net/gatieme/article/details/52741221)
