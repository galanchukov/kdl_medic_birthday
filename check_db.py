import paramiko

def main():
    host = "193.106.196.11"
    user = "root"
    password = "aHxV36vnKJjuNE"
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password)
    
    # Simple check
    stdin, stdout, stderr = client.exec_command('docker compose -f /root/kdl_bd/docker-compose.yml exec -T api node -e "const {PrismaClient}=require(\'@prisma/client\'); const p=new PrismaClient(); p.doctor.count().then(c=>console.log(\'COUNT:\',c))"')
    print(stdout.read().decode())
    
    client.close()

if __name__ == "__main__":
    main()
