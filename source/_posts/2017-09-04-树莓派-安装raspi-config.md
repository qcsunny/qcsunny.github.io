---
title: 树莓派-安装raspi-config
date: 2017-09-04 10:11:00
categories:
  - Linux
  - Software
tags:
  - Linux
  - Raspberry
  - Software
top: 
sticky:
comments: true
password: 
---
*20170904初成文*
raspi-config在raspbian中是预装的，而在kali、ubuntu mate、osmc等系统中则是没有内置raspi-config的，但是raspi-config的gui设置有时是相对方便的，比如kali默认没有完整的使用整个SD卡空间，而针对树莓派最好的扩展工具是raspi-config

<!-- more -->

有时甚至可能误操作在raspbian中把raspi-config卸载了，而我自己也亲身经历了一次。。。
在其它系统中手动安装raspi-config的方法：
# 手动下载deb包

```
wget http://mirrors.ustc.edu.cn/archive.raspberrypi.org/pool/main/r/raspi-config/raspi-config_20170811_all.deb
```

# 解决依赖问题

```
sudo apt install whiptail parted lua5.1  alsa-utils psmisc
```

# 安装软件

```
dpkg -i raspi-config_20170811_all.deb
```

# 运行raspi-config

需要sudo或以上权限

```
sudo raspi-config
```

# raspi-config能够运行的还有一个重要前提，boot分区已被正常挂载
先查看一下boot分区所在设备号

```
fdisk -l
再把它挂载到/boot上(以下是示例，不一定是mmcblk0p6，需根据实际情况决定)
mount /dev/mmcblk0p6 /boot
```