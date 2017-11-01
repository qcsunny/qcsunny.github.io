---
title: 树莓派pt下载机-Deluge-Transmission-Rtorrent
categories:
  - Linux
  - Software
tags:
  - Linux
  - Software
  - Deluge
  - Transmission
  - Rtorrent
comments: true
date: 2017-09-01 09:53:49
top:
password:
---
PT三大客户端，Deluge、Transmission、Rtorrent

<!-- more -->
# 安装deluge:

```
sudo apt-get install python-software-properties  //树莓派不用添加repo
sudo add-apt-repository ppa:deluge-team/ppa   //树莓派不用添加repo，直接执行下面两步
```

```
sudo apt-get update
sudo apt-get install deluge deluged deluge-web
```

```
cd /etc
sudo nano rc.local      //ubuntu1610无此文件，已服务化
deluge-web --fork        //后台运行
```

访问地址：（默认密码deluge）
http://树莓派ip地址:8112

# 安装transmission

```
sudo apt install transmission-daemon
sudo /etc/init.d/transmission-daemon stop
sudo nano /etc/transmission-daemon/settings.json
"rpc-password": "123",                    //主要是这行修改密码
"rpc-whitelist": "*",                        //主要是这行修改白名单
sudo /etc/init.d/transmission-daemon start
```

访问地址：（默认用户名transmission，可在settings.json修改）
http://树莓派ip地址:9091
安装transmission面板

```
wget https://github.com/ronggang/transmission-web-control/raw/master/release/tr-control-easy-install.sh
sudo bash tr-control-easy-install.sh
```

# 安装rtorrent和irssi（直接用一键脚本）

```
sudo bash -c "$(wget --no-check-certificate -qO - https://raw.githubusercontent.com/arakasi72/rtinst/master/rtsetup)"
sudo rtinst --ssh-default --rutorrent-stable  //安装稳定版，ssh端口号不改变
sudo nano ~/.rtorrent.rc    //修改配置
```

```
rt restart
sudo rtupdate              //更换版本
```

访问地址：
http://树莓派ip地址/rutorrent/
或
https://树莓派ip地址/rutorrent/

由于树莓派性能一般，配置参考（）：

```
throttle.global_down.max_rate.set = 0
throttle.global_up.max_rate.set = 0
throttle.max_downloads.global.set = 300
throttle.max_uploads.global.set = 300
throttle.min_peers.normal.set = 99
throttle.max_peers.normal.set = 100
throttle.min_peers.seed.set = -1
throttle.max_peers.seed.set = -1
throttle.max_downloads.set = 50
throttle.max_uploads.set = 50
trackers.numwant.set = 100
network.max_open_files.set = 600
network.max_open_sockets.set = 999
network.http.max_open.set = 99
pieces.memory.max.set = 800M
network.http.dns_cache_timeout.set = 25
```
