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

Linux下PT三大客户端，Deluge、Transmission、Rtorrent

<!-- more -->

## 安装deluge

### 安装主程序
```bash
sudo aptitude update
sudo aptitude install deluge deluged deluge-web
```
访问地址：（默认密码deluge）
http://树莓派ip地址:8112

### 添加开机启动项
新建`nano /etc/init.d/deluge-web`加入下面两行
```bash
#/bin/bash
/usr/bin/deluge-web --fork
```
执行`update-rc.d deluge-web defaults 19`建立链接，
'defaults' 指默认运行级别, 它可以是 2 到 5 中某个值. 参数 '19' 确保 deluge-web脚本 在其它参数大于 20 的脚本之前执行.

## 安装transmission

### 安装主程序
```bash
sudo aptitude install transmission-daemon
sudo /etc/init.d/transmission-daemon stop    //或sudo systemctl stop transmission-daemon
sudo nano /etc/transmission-daemon/settings.json
"rpc-username": "transmission"    //修改登陆用户名
"rpc-password": "123",    //修改登陆密码
"rpc-whitelist": "*",     //修改白名单
sudo /etc/init.d/transmission-daemon start    //或sudo systemctl start transmission-daemon
```

访问地址：（默认用户名transmission，可在settings.json修改）
http://树莓派ip地址:9091

### 安装transmission面板
```
wget https://github.com/ronggang/transmission-web-control/raw/master/release/tr-control-easy-install.sh
sudo bash tr-control-easy-install.sh
```

## 安装rtorrent和irssi

### 安装主程序
推荐用一键脚本，带irssi

```
sudo bash -c "$(wget --no-check-certificate -qO - https://raw.githubusercontent.com/arakasi72/rtinst/master/rtsetup)"
sudo rtinst --ssh-default --rutorrent-master  //安装master分支，ssh端口号不改变
sudo nano ~/.rtorrent.rc    //修改配置
```

### 其它常用命令
```
rt restart                 //重启rt
rt -i restart              //重启irssi
sudo rtupdate              //更换版本
sudo rtsetup release     //切换分支
```
访问地址：
http://树莓派ip地址/rutorrent/
或
https://树莓派ip地址/rutorrent/

### rt配置参考
由于树莓派性能一般，配置参考：

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
参考文章：
[Debian开机启动](https://www.debian.org/doc/manuals/debian-faq/ch-customizing.zh-cn.html#s-booting)
[transmission一键安装脚本](https://github.com/ronggang/transmission-web-control/)
[rtorrent一键安装脚本](https://github.com/arakasi72/rtinst)
[rt配置参考](https://github.com/rakshasa/rtorrent/wiki/Performance-Tuning#rtorrent-related-settings)